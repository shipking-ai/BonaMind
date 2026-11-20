<#
  Installs the test MSIX (scripts/package-msix.mjs without the Partner
  Center values), launches the app from it, and removes it again, failing on
  the first thing that goes wrong:

    1. the package is signed and Add-AppxPackage installs it
    2. Windows lists the package, with BonaMind.exe in its install folder
    3. the bonamind:// link is registered to the package
    4. the app starts from the package and is still running 20 seconds later
    5. Remove-AppxPackage removes it

  Windows installs a package that starts a full-trust exe only when a trusted
  certificate signs it. The Store signs the real upload; for this test,
  -TrustTestCertificate makes a throwaway certificate for the test publisher,
  signs the package with it, and trusts it machine-wide. That changes the
  machine's trusted certificates, so only CI passes it (desktop-windows.yml,
  on a runner that is thrown away afterwards). Without it, the package must
  already be signed by a certificate this PC trusts.

    powershell -File scripts/smoke-windows-msix.ps1 [-Package path\to\*_test.msix] [-TrustTestCertificate]
#>
param([string]$Package, [switch]$TrustTestCertificate)

$ErrorActionPreference = 'Stop'
$name = 'BonaMind.LocalTest'

function Fail([string]$message) {
  Write-Host "::error::$message"
  exit 1
}

function Find-SdkTool([string]$exe) {
  $root = 'C:\Program Files (x86)\Windows Kits\10\bin'
  $found = Get-ChildItem $root -Directory -Filter '10.*' -ErrorAction SilentlyContinue |
    Sort-Object { [version]$_.Name } -Descending |
    ForEach-Object { Join-Path $_.FullName "x64\$exe" } |
    Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $found) { Fail "$exe not found. Install the Windows SDK." }
  $found
}

if (-not $Package) {
  $found = Get-ChildItem 'src-tauri/target/release/bundle/msix' -Filter '*_test.msix' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $found) { Fail 'No *_test.msix under src-tauri/target/release/bundle/msix. Run node scripts/package-msix.mjs first.' }
  $Package = $found.FullName
}
Write-Host "Package: $Package"

if ($TrustTestCertificate) {
  $cert = New-SelfSignedCertificate -Type Custom -Subject 'CN=BonaMind Local Test' `
    -KeyUsage DigitalSignature -FriendlyName 'BonaMind MSIX smoke test' `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
  & (Find-SdkTool 'signtool.exe') sign /fd SHA256 /sha1 $cert.Thumbprint $Package
  if ($LASTEXITCODE -ne 0) { Fail "signtool exited with $LASTEXITCODE." }
  $cer = Join-Path $env:TEMP 'bonamind-msix-test.cer'
  Export-Certificate -Cert $cert -FilePath $cer | Out-Null
  Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null
  Write-Host "Signed with a throwaway certificate ($($cert.Thumbprint))."
}

# A previous run that failed half-way may have left it installed.
Get-AppxPackage -Name $name | Remove-AppxPackage

# 1. Install.
try {
  Add-AppxPackage -Path $Package
} catch {
  Fail "Add-AppxPackage failed: $($_.Exception.Message)"
}

# 2. Listed, with the exe where the manifest says.
$pkg = Get-AppxPackage -Name $name
if (-not $pkg) { Fail "Windows does not list $name after installing." }
$exe = Join-Path $pkg.InstallLocation 'BonaMind.exe'
if (-not (Test-Path $exe)) { Fail "No BonaMind.exe in $($pkg.InstallLocation)." }
Write-Host "Installed: $($pkg.PackageFullName)"

# 3. The link scheme belongs to the package (MSIX ignores registry writes, so
# this only works because the manifest declares it).
$protocols = (Get-AppxPackageManifest $pkg).Package.Applications.Application.Extensions.Extension |
  Where-Object { $_.Category -eq 'windows.protocol' } | ForEach-Object { $_.Protocol.Name }
if ($protocols -notcontains 'bonamind') { Fail "The package does not register bonamind:// (has: $($protocols -join ', '))." }
Write-Host "Links: $($protocols -join ', ')"

# 4. Starts from the package and stays up.
Start-Process "shell:AppsFolder\$($pkg.PackageFamilyName)!BonaMind"
Start-Sleep -Seconds 20
$running = Get-Process -Name 'BonaMind' -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -and $_.Path.StartsWith($pkg.InstallLocation, [StringComparison]::OrdinalIgnoreCase) }
if (-not $running) { Fail 'The packaged app was not running 20 seconds after starting it.' }
Write-Host "Running: $($running[0].Path)"
$running | Stop-Process -Force

# 5. Remove.
Remove-AppxPackage -Package $pkg.PackageFullName
if (Get-AppxPackage -Name $name) { Fail "$name is still installed after Remove-AppxPackage." }

Write-Host 'MSIX smoke test passed: install, links, launch, remove.'

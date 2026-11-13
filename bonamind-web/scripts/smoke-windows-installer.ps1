<#
  Installs the freshly built Windows installer, launches the app, and
  uninstalls it again, failing on the first thing that goes wrong:

    1. the NSIS installer runs silently and exits 0
    2. the app lands in %LOCALAPPDATA%\BonaMind (installMode: currentUser)
    3. Explorer's "Make a course with BonaMind" entry is registered and
       points at the installed exe (windows/installer-hooks.nsh)
    4. the app starts and is still running 20 seconds later
    5. the uninstaller removes the app and the Explorer entry

  CI runs it after every installer build (desktop-windows.yml). Locally:
    pwsh scripts/smoke-windows-installer.ps1 [path\to\BonaMind_x.y.z_x64-setup.exe]
#>
param([string]$Installer)

$ErrorActionPreference = 'Stop'

function Fail([string]$message) {
  Write-Host "::error::$message"
  exit 1
}

if (-not $Installer) {
  $found = Get-ChildItem 'src-tauri/target/release/bundle/nsis' -Filter '*-setup.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $found) { Fail 'No *-setup.exe under src-tauri/target/release/bundle/nsis. Build the installer first.' }
  $Installer = $found.FullName
}
Write-Host "Installer: $Installer"

$installDir = Join-Path $env:LOCALAPPDATA 'BonaMind'
$verbKey = 'HKCU:\Software\Classes\SystemFileAssociations\.pdf\shell\BonaMind'

# 1. Silent install.
$install = Start-Process -FilePath $Installer -ArgumentList '/S' -Wait -PassThru
if ($install.ExitCode -ne 0) { Fail "The installer exited with $($install.ExitCode)." }

# 2. Installed where currentUser mode puts it.
$exe = Get-ChildItem $installDir -Filter '*.exe' -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -notmatch '^uninstall' } | Select-Object -First 1
if (-not $exe) { Fail "No app exe in $installDir after installing." }
Write-Host "Installed: $($exe.FullName)"

# 3. Explorer entry, pointing at that exe.
if (-not (Test-Path "$verbKey\command")) { Fail "The Explorer entry ($verbKey) was not registered." }
$command = (Get-ItemProperty "$verbKey\command").'(default)'
if ($command -notlike "*$($exe.FullName)*--create*") { Fail "The Explorer entry runs '$command', not the installed exe with --create." }
Write-Host "Explorer entry: $command"

# 4. Starts and stays up.
$app = Start-Process -FilePath $exe.FullName -PassThru
Start-Sleep -Seconds 20
if ($app.HasExited) { Fail "The app exited within 20 seconds of starting (exit code $($app.ExitCode))." }
$app.Refresh()
if ($app.MainWindowHandle -eq 0) {
  # The runner's session may not give the window a handle, so this is a note,
  # not a failure. The process staying up is the check.
  Write-Host 'Note: no main window handle (expected on some CI sessions).'
} else {
  Write-Host "Window: '$($app.MainWindowTitle)'"
}
Stop-Process -Id $app.Id -Force
Get-Process -Name $exe.BaseName -ErrorAction SilentlyContinue | Stop-Process -Force

# 5. Silent uninstall. NSIS uninstallers copy themselves to %TEMP% and return
# at once, so wait for the files to go rather than for the process.
$uninstaller = Join-Path $installDir 'uninstall.exe'
if (-not (Test-Path $uninstaller)) { Fail "No uninstaller at $uninstaller." }
Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait
$deadline = (Get-Date).AddSeconds(60)
while ((Test-Path $exe.FullName) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2 }
if (Test-Path $exe.FullName) { Fail 'The app exe is still there 60 seconds after uninstalling.' }
if (Test-Path $verbKey) { Fail "The uninstaller left the Explorer entry ($verbKey) behind." }

Write-Host 'Installer smoke test passed: install, Explorer entry, launch, uninstall.'

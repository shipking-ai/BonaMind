/**
 * Packages the built Windows app as an MSIX for the Microsoft Store.
 *
 * The Store signs the packages it publishes, so this route needs no
 * code-signing certificate. Inside a package Windows ignores what the NSIS
 * installer writes to the registry, so the manifest declares those things
 * instead, from the same sources:
 *
 *   links             <- plugins.deep-link schemes in src-tauri/tauri.conf.json
 *   Explorer verb     <- DOC_EXTS / AUDIO_EXTS in src-tauri/src/handoff.rs
 *   Start with Windows<- STARTUP_TASK_ID in src-tauri/src/store.rs
 *
 * Identity: with MSIX_IDENTITY_NAME, MSIX_PUBLISHER and
 * MSIX_PUBLISHER_DISPLAY_NAME set (Partner Center -> the app -> Product
 * identity) this makes the Store upload, which the Store signs. Without them
 * it makes a test package for scripts/smoke-windows-msix.ps1. Windows only
 * installs a package that starts a full-trust exe once it is signed by a
 * trusted certificate, so CI signs the test package with a throwaway one.
 *
 * Usage (after `npx tauri build --no-bundle`):
 *   node scripts/package-msix.mjs [--exe <path>] [--out-dir <dir>]
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TEST_PUBLISHER = 'CN=BonaMind Local Test';
const TEST_IDENTITY = {
  name: 'BonaMind.LocalTest',
  publisher: TEST_PUBLISHER,
  publisherDisplayName: 'BonaMind (local test)',
  store: false,
};
const LOGOS = ['StoreLogo.png', 'Square44x44Logo.png', 'Square71x71Logo.png', 'Square150x150Logo.png'];

const xml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Store packages need X.Y.Z.0 with each part at most 65535. */
export function msixVersion(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`MSIX needs a plain X.Y.Z version, got "${version}"`);
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 65535)) throw new Error(`Each part of an MSIX version is at most 65535, got "${version}"`);
  return `${parts.join('.')}.0`;
}

const rustList = (src, name) =>
  [...(new RegExp(`${name}: &\\[&str\\] = &\\[([^\\]]*)\\]`).exec(src)?.[1] ?? '').matchAll(/"(\w+)"/g)].map((m) => m[1]);

/** The file types the app reads, from src-tauri/src/handoff.rs. */
export function readFileTypes(handoffRs) {
  const docs = rustList(handoffRs, 'DOC_EXTS');
  const audio = rustList(handoffRs, 'AUDIO_EXTS');
  if (!docs.length || !audio.length) throw new Error('DOC_EXTS / AUDIO_EXTS not found in handoff.rs');
  return { docs, audio };
}

/** The startup task id the Rust shell enables, from src-tauri/src/store.rs. */
export function readStartupTaskId(storeRs) {
  const id = /STARTUP_TASK_ID: &str = "([A-Za-z0-9]+)"/.exec(storeRs)?.[1];
  if (!id) throw new Error('STARTUP_TASK_ID not found in store.rs');
  return id;
}

/** The Partner Center identity when all three values are set, else the test identity. */
export function resolveIdentity(env) {
  const keys = ['MSIX_IDENTITY_NAME', 'MSIX_PUBLISHER', 'MSIX_PUBLISHER_DISPLAY_NAME'];
  const set = keys.filter((k) => (env[k] ?? '').trim() !== '');
  if (set.length === 0) return TEST_IDENTITY;
  const missing = keys.filter((k) => !set.includes(k));
  if (missing.length) throw new Error(`Set all three Partner Center values; missing ${missing.join(', ')}`);
  return {
    name: env.MSIX_IDENTITY_NAME.trim(),
    publisher: env.MSIX_PUBLISHER.trim(),
    publisherDisplayName: env.MSIX_PUBLISHER_DISPLAY_NAME.trim(),
    store: true,
  };
}

function fileTypeAssociation(name, label, exts) {
  return `        <uap3:Extension Category="windows.fileTypeAssociation">
          <uap3:FileTypeAssociation Name="${name}" Parameters="--create &quot;%1&quot;">
            <uap:DisplayName>${xml(label)}</uap:DisplayName>
            <uap:SupportedFileTypes>
${exts.map((e) => `              <uap:FileType>.${e}</uap:FileType>`).join('\n')}
            </uap:SupportedFileTypes>
            <uap2:SupportedVerbs>
              <uap3:Verb Id="create" Parameters="--create &quot;%1&quot;">Make a course with BonaMind</uap3:Verb>
            </uap2:SupportedVerbs>
          </uap3:FileTypeAssociation>
        </uap3:Extension>`;
}

export function buildManifest({ identity, version, displayName, description, executable, schemes, fileTypes, startupTaskId }) {
  const protocols = schemes
    .map(
      (s) => `        <uap3:Extension Category="windows.protocol">
          <uap3:Protocol Name="${xml(s)}" Parameters="&quot;%1&quot;">
            <uap:DisplayName>${xml(displayName)}</uap:DisplayName>
          </uap3:Protocol>
        </uap3:Extension>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:uap2="http://schemas.microsoft.com/appx/manifest/uap/windows10/2"
  xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"
  xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap uap2 uap3 desktop rescap">
  <Identity Name="${xml(identity.name)}" Publisher="${xml(identity.publisher)}" Version="${version}" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>${xml(displayName)}</DisplayName>
    <PublisherDisplayName>${xml(identity.publisherDisplayName)}</PublisherDisplayName>
    <Logo>Assets\\StoreLogo.png</Logo>
    <Description>${xml(description)}</Description>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Resources>
    <Resource Language="en-us" />
  </Resources>
  <Applications>
    <Application Id="BonaMind" Executable="${xml(executable)}" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="${xml(displayName)}"
        Description="${xml(description)}"
        BackgroundColor="transparent"
        Square150x150Logo="Assets\\Square150x150Logo.png"
        Square44x44Logo="Assets\\Square44x44Logo.png">
        <uap:DefaultTile Square71x71Logo="Assets\\Square71x71Logo.png" />
      </uap:VisualElements>
      <Extensions>
${protocols}
${fileTypeAssociation('bonamind.documents', 'Course documents', fileTypes.docs)}
${fileTypeAssociation('bonamind.audio', 'Lecture recordings', fileTypes.audio)}
        <desktop:Extension Category="windows.startupTask" Executable="${xml(executable)}" EntryPoint="Windows.FullTrustApplication">
          <desktop:StartupTask TaskId="${startupTaskId}" Enabled="false" DisplayName="${xml(displayName)}" />
        </desktop:Extension>
      </Extensions>
    </Application>
  </Applications>
  <Capabilities>
    <Capability Name="internetClient" />
    <rescap:Capability Name="runFullTrust" />
    <DeviceCapability Name="microphone" />
  </Capabilities>
</Package>
`;
}

/** makeappx.exe from the newest Windows SDK, or MAKEAPPX if set. */
function findMakeappx() {
  if (process.env.MAKEAPPX) return process.env.MAKEAPPX;
  const root = 'C:/Program Files (x86)/Windows Kits/10/bin';
  const versions = existsSync(root)
    ? readdirSync(root).filter((d) => /^10\./.test(d) && existsSync(join(root, d, 'x64/makeappx.exe')))
    : [];
  versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!versions.length) throw new Error('makeappx.exe not found. Install the Windows SDK or set MAKEAPPX.');
  return join(root, versions.at(-1), 'x64/makeappx.exe');
}

function main() {
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const tauriDir = join(appDir, 'src-tauri');
  const argv = process.argv.slice(2);
  const arg = (flag, fallback) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  const conf = JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));
  const exe = resolve(arg('--exe', join(tauriDir, 'target/release/bonamind-desktop.exe')));
  const outDir = resolve(arg('--out-dir', join(tauriDir, 'target/release/bundle/msix')));
  if (!existsSync(exe)) throw new Error(`${exe} not found. Run \`npx tauri build --no-bundle\` first.`);

  const identity = resolveIdentity(process.env);
  const version = msixVersion(pkg.version);
  const executable = `${conf.productName}.exe`;
  const manifest = buildManifest({
    identity,
    version,
    displayName: conf.productName,
    description: conf.bundle.shortDescription,
    executable,
    schemes: conf.plugins['deep-link'].desktop.schemes,
    fileTypes: readFileTypes(readFileSync(join(tauriDir, 'src/handoff.rs'), 'utf8')),
    startupTaskId: readStartupTaskId(readFileSync(join(tauriDir, 'src/store.rs'), 'utf8')),
  });

  const layout = join(outDir, identity.store ? 'layout' : 'layout-test');
  rmSync(layout, { recursive: true, force: true });
  mkdirSync(join(layout, 'Assets'), { recursive: true });
  copyFileSync(exe, join(layout, executable));
  for (const logo of LOGOS) copyFileSync(join(tauriDir, 'icons', logo), join(layout, 'Assets', logo));
  writeFileSync(join(layout, 'AppxManifest.xml'), manifest);

  const out = join(outDir, `${conf.productName}_${version}_x64${identity.store ? '' : '_test'}.msix`);
  execFileSync(findMakeappx(), ['pack', '/d', layout, '/p', out, '/o'], { stdio: 'inherit' });
  console.log(`${identity.store ? 'Store' : 'Test'} package: ${out}`);
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `msix=${out}\n`, { flag: 'a' });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (err) {
    console.log(`::error::${err.message}`);
    process.exit(1);
  }
}

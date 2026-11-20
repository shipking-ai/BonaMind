/**
 * The Microsoft Store package (MSIX). The Store signs what it publishes, so
 * the Store upload needs no code-signing certificate, but inside a package Windows
 * ignores the registry entries the NSIS installer writes: links, the
 * Explorer verb and Start with Windows each have to be declared in the
 * package manifest instead. These tests pin that manifest to the same
 * sources the installer and the Rust shell use.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildManifest,
  msixVersion,
  readFileTypes,
  readStartupTaskId,
  resolveIdentity,
  TEST_PUBLISHER,
} from '../../scripts/package-msix.mjs';

const APP = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(APP, p), 'utf8');
const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
const fileTypes = readFileTypes(read('src-tauri/src/handoff.rs'));
const startupTaskId = readStartupTaskId(read('src-tauri/src/store.rs'));

function manifest(env: Record<string, string> = {}) {
  const xml = buildManifest({
    identity: resolveIdentity(env),
    version: msixVersion('2.3.7'),
    displayName: conf.productName,
    description: conf.bundle.shortDescription,
    executable: 'BonaMind.exe',
    schemes: conf.plugins['deep-link'].desktop.schemes,
    fileTypes,
    startupTaskId,
  });
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return { xml, doc };
}

const all = (doc: Document, tag: string) => [...doc.getElementsByTagName(tag)];

describe('Windows Store package (MSIX)', () => {
  it('uses the four-part version the Store requires', () => {
    expect(msixVersion('2.3.7')).toBe('2.3.7.0');
    expect(() => msixVersion('2.3.7-beta.1')).toThrow();
    expect(() => msixVersion('70000.0.0')).toThrow();
  });

  it('runs the app exe as a full-trust desktop app', () => {
    const { doc } = manifest();
    const app = all(doc, 'Application')[0];
    expect(app.getAttribute('Executable')).toBe('BonaMind.exe');
    expect(app.getAttribute('EntryPoint')).toBe('Windows.FullTrustApplication');
    const caps = all(doc, 'rescap:Capability').map((c) => c.getAttribute('Name'));
    expect(caps).toContain('runFullTrust');
    expect(all(doc, 'Capability').map((c) => c.getAttribute('Name'))).toContain('internetClient');
    // Lecture recording: a packaged app gets no microphone without this.
    expect(all(doc, 'DeviceCapability').map((c) => c.getAttribute('Name'))).toContain('microphone');
  });

  it('opens every link scheme the app registers, passing the link through', () => {
    const { doc } = manifest();
    const protocols = all(doc, 'uap3:Protocol');
    expect(protocols.map((p) => p.getAttribute('Name'))).toEqual(conf.plugins['deep-link'].desktop.schemes);
    for (const p of protocols) expect(p.getAttribute('Parameters')).toBe('"%1"');
  });

  it('offers "Make a course with BonaMind" on exactly the files the app reads', () => {
    const { doc } = manifest();
    const types = all(doc, 'uap:FileType').map((t) => t.textContent);
    expect(types).toEqual([...fileTypes.docs, ...fileTypes.audio].map((e) => `.${e}`));
    const verbs = all(doc, 'uap3:Verb');
    expect(verbs.length).toBe(all(doc, 'uap3:FileTypeAssociation').length);
    for (const v of verbs) {
      expect(v.textContent).toBe('Make a course with BonaMind');
      expect(v.getAttribute('Parameters')).toBe('--create "%1"');
    }
  });

  it('declares the startup task the Rust shell asks Windows to enable', () => {
    const { doc } = manifest();
    const [task] = all(doc, 'desktop:StartupTask');
    expect(task.getAttribute('TaskId')).toBe(startupTaskId);
    // Off until the user turns on Start with Windows.
    expect(task.getAttribute('Enabled')).toBe('false');
  });

  it('builds a test package without Partner Center details', () => {
    const { doc } = manifest();
    const identity = all(doc, 'Identity')[0];
    expect(identity.getAttribute('Name')).toBe('BonaMind.LocalTest');
    // The smoke test signs it with a certificate for exactly this subject.
    expect(identity.getAttribute('Publisher')).toBe(TEST_PUBLISHER);
    expect(read('scripts/smoke-windows-msix.ps1')).toContain(`-Subject '${TEST_PUBLISHER}'`);
  });

  it('uses the Partner Center identity for the Store package', () => {
    const env = {
      MSIX_IDENTITY_NAME: 'Example.BonaMind',
      MSIX_PUBLISHER: 'CN=00000000-1111-2222-3333-444444444444',
      MSIX_PUBLISHER_DISPLAY_NAME: 'Example & Co',
    };
    const { doc, xml } = manifest(env);
    const identity = all(doc, 'Identity')[0];
    expect(identity.getAttribute('Name')).toBe('Example.BonaMind');
    expect(identity.getAttribute('Publisher')).toBe('CN=00000000-1111-2222-3333-444444444444');
    expect(identity.getAttribute('Version')).toBe('2.3.7.0');
    expect(all(doc, 'PublisherDisplayName')[0].textContent).toBe('Example & Co');
    expect(xml).toContain('Example &amp; Co');
    expect(() => resolveIdentity({ MSIX_IDENTITY_NAME: 'Example.BonaMind' })).toThrow(/MSIX_PUBLISHER/);
  });

  it('is built and install-tested in the Windows workflow', () => {
    const yml = read('../.github/workflows/desktop-windows.yml');
    expect(yml).toContain('node scripts/package-msix.mjs');
    expect(yml).toContain('./scripts/smoke-windows-msix.ps1 -TrustTestCertificate');
    expect(read('scripts/smoke-windows-msix.ps1')).toContain('Add-AppxPackage -Path $Package');
  });
});

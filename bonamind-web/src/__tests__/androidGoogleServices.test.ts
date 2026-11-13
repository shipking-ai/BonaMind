/**
 * Push on Android needs `android/app/google-services.json`, which is kept out
 * of the public repo. The Play release build writes it from the
 * GOOGLE_SERVICES_JSON secret; without that step every Play build shipped
 * with push silently off (app/build.gradle skips the Google services plugin
 * when the file is missing).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = resolve(__dirname, '../..');
const SCRIPT = join(APP, 'scripts/write-google-services.mjs');
const WORKFLOW = resolve(APP, '../.github/workflows/mobile-android.yml');

const config = (packageName: string) =>
  JSON.stringify({
    project_info: { project_id: 'bonamind-test' },
    client: [{ client_info: { android_client_info: { package_name: packageName } } }],
  });

function run(secret: string | undefined) {
  const dir = mkdtempSync(join(tmpdir(), 'gservices-'));
  const out = join(dir, 'google-services.json');
  const gradle = join(dir, 'build.gradle');
  writeFileSync(gradle, 'android {\n    defaultConfig {\n        applicationId "com.auramind.app"\n    }\n}\n');
  const env = { ...process.env, GOOGLE_SERVICES_JSON: secret ?? '' };
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, '--out', out, '--gradle', gradle], { env, encoding: 'utf8' });
    return { code: 0, stdout, out };
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string };
    return { code: e.status, stdout: e.stdout + e.stderr, out };
  }
}

describe('google-services.json in the Play build', () => {
  it('writes the file from the secret', () => {
    const r = run(config('com.auramind.app'));
    expect(r.code).toBe(0);
    expect(JSON.parse(readFileSync(r.out, 'utf8')).project_info.project_id).toBe('bonamind-test');
  });

  it('refuses a file registered for another package name', () => {
    // The trap HANDOFF used to set: the app's permanent ID is com.auramind.app.
    const r = run(config('com.bonamind.app'));
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('com.auramind.app');
    expect(existsSync(r.out)).toBe(false);
  });

  it('refuses a secret that is not JSON', () => {
    const r = run('not json');
    expect(r.code).toBe(1);
    expect(existsSync(r.out)).toBe(false);
  });

  it('warns but still builds when the secret is not set', () => {
    const r = run(undefined);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('::warning::');
    expect(existsSync(r.out)).toBe(false);
  });

  it('runs in the release workflow before the bundle is assembled', () => {
    const yml = readFileSync(WORKFLOW, 'utf8');
    const write = yml.indexOf('node scripts/write-google-services.mjs');
    const assemble = yml.indexOf('bundleRelease');
    expect(write).toBeGreaterThan(-1);
    expect(write).toBeLessThan(assemble);
    expect(yml).toContain('GOOGLE_SERVICES_JSON: ${{ secrets.GOOGLE_SERVICES_JSON }}');
  });
});

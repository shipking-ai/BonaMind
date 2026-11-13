/**
 * Both iPhone apps must build for a real device (arm64, iphoneos SDK) on
 * every pull request, not only when someone dispatches a build by hand. A
 * simulator build alone can pass while the device build fails: different
 * SDK, architecture and Release-only settings, and the widget extension has
 * to land inside the app bundle.
 *
 * The native app's end-to-end jobs share mobile-builds.yml but sign in to
 * the real backend with test accounts, so they must stay manual.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = (name: string) =>
  readFileSync(resolve(__dirname, '../../../.github/workflows', name), 'utf8');

/** The text of one job, from its key to the next top-level job key. */
function job(yml: string, name: string): string {
  const start = yml.indexOf(`\n  ${name}:\n`);
  expect(start, `job ${name}`).toBeGreaterThan(-1);
  const rest = yml.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

const triggers = (yml: string) => yml.slice(yml.indexOf('\non:'), yml.indexOf('\njobs:'));
const condition = (block: string) => block.match(/^ {4}if: (.+)$/m)?.[1] ?? '';

describe('Capacitor iPhone app (mobile-ios.yml)', () => {
  const yml = workflow('mobile-ios.yml');
  const device = job(yml, 'ios-device-ipa');

  it('runs on pull requests', () => {
    expect(triggers(yml)).toMatch(/\n {2}pull_request:/);
  });

  it('builds for a device on every run, not only by hand', () => {
    expect(condition(device)).not.toContain('workflow_dispatch');
    expect(device).toContain('-sdk iphoneos');
  });

  it('checks the app and widget binaries are arm64', () => {
    expect(device).toMatch(/lipo -archs/);
    expect(device).toContain('BonaMindWidgets.appex');
  });
});

describe('native iPhone app (mobile-builds.yml)', () => {
  const yml = workflow('mobile-builds.yml');

  it('runs on pull requests that touch the native app', () => {
    const on = triggers(yml);
    expect(on).toMatch(/\n {2}pull_request:/);
    expect(on).toContain("'mobile/**'");
    expect(on).toContain("'packages/core/**'");
  });

  it('builds the unsigned device IPA on pull requests', () => {
    const ipa = job(yml, 'ios-unsigned-ipa');
    expect(condition(ipa)).toContain("github.event_name != 'workflow_dispatch'");
    expect(ipa).toContain('-sdk iphoneos');
    expect(ipa).toMatch(/lipo -archs/);
  });

  it('keeps the end-to-end jobs manual', () => {
    for (const name of ['e2e-ios', 'e2e-android']) {
      const cond = condition(job(yml, name));
      expect(cond, name).toContain("inputs.job == 'e2e'");
      expect(cond, name).not.toContain('event_name');
    }
  });
});

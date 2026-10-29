import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { resolvePlan } from '../lib/subscriptionPlan';

/**
 * The plan name every screen shows comes from app_metadata.subscription_status
 * — the same server-written field api/_lib/entitlement.ts reads to decide
 * access.
 *
 * It used to come from two places that disagreed on the same account:
 *
 *   - App.tsx mapped `user_metadata.plan`, which a signed-in user can set with
 *     one `auth.updateUser` call. The Windows, iPhone and Android settings
 *     showed it, so the owner's account read "Pro".
 *   - The full settings page read `user_profiles.plan`, which nothing in the
 *     billing path keeps current, so the same account read "Free".
 *
 * Neither reflected the subscription. These tests pin the display to the
 * entitlement source and fail if a user_metadata read creeps back in.
 */

describe('resolvePlan', () => {
  it('ignores a plan set in user_metadata', () => {
    expect(
      resolvePlan({ app_metadata: {}, user_metadata: { plan: 'Pro' } }),
      'user_metadata is client-writable and must never decide the plan shown',
    ).toBe('Starter');
  });

  it('ignores a subscription_status forged in user_metadata', () => {
    expect(
      resolvePlan({ app_metadata: {}, user_metadata: { subscription_status: 'active' } }),
    ).toBe('Starter');
  });

  it('shows Pro for a subscription app_metadata records, whatever user_metadata says', () => {
    expect(
      resolvePlan({ app_metadata: { subscription_status: 'active' }, user_metadata: { plan: 'Starter' } }),
    ).toBe('Pro');
  });

  it('shows Pro while trialing or in the dunning grace window', () => {
    expect(resolvePlan({ app_metadata: { subscription_status: 'trialing' } })).toBe('Pro');
    expect(resolvePlan({ app_metadata: { subscription_status: 'past_due' } })).toBe('Pro');
  });

  it('shows Starter once the subscription has ended or never existed', () => {
    for (const status of ['canceled', 'expired', 'none', '', 'Pro', 42, null]) {
      expect(resolvePlan({ app_metadata: { subscription_status: status } }), String(status)).toBe('Starter');
    }
    expect(resolvePlan({})).toBe('Starter');
    expect(resolvePlan(null)).toBe('Starter');
    expect(resolvePlan(undefined)).toBe('Starter');
  });

  it('does not treat a staff role as a subscription', () => {
    // Staff get the product unlocked through hasFreeAccess, but that is not a
    // paid plan, and the label should say what billing says.
    expect(resolvePlan({ app_metadata: { role: 'owner' } })).toBe('Starter');
  });
});

const SRC = path.resolve(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf8');

/** Every .ts/.tsx under src/, excluding test files. */
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe('plan display source', () => {
  it('no source file reads a plan out of user_metadata', () => {
    // Comments are stripped: the ones explaining why this field is ignored
    // have to be able to name it.
    const code = (file: string) =>
      fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const offenders = sourceFiles(SRC).filter((file) =>
      /metadata\??\.plan\b|metadata\??\.?\[['"]plan['"]\]/.test(code(file)),
    );
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('App.tsx builds the profile plan from resolvePlan', () => {
    expect(read('App.tsx')).toMatch(/plan:\s*resolvePlan\(authUser\)/);
  });

  it('App.tsx no longer writes the plan into user_metadata', () => {
    // updateUserProfile writes its payload with auth.updateUser, i.e. into
    // user_metadata. Writing the plan there is how a stale or forged label
    // got persisted in the first place.
    const app = read('App.tsx');
    const write = app.slice(app.indexOf('auth.updateUser({'), app.indexOf('if (error) throw error;'));
    expect(write).not.toMatch(/\bplan:/);
  });

  it('userService reports the plan from resolvePlan, not the user_profiles row', () => {
    const svc = read('services', 'user', 'userService.ts');
    expect(svc).not.toMatch(/plan:\s*(new)?[pP]rofile\.plan/);
    expect(svc.match(/plan:\s*resolvePlan\(user\)/g)?.length).toBe(2);
  });

  it('the full settings pages show the workspace plan', () => {
    // The workspace user is App.tsx's profile, so this is the same value the
    // Windows and iPhone settings show.
    expect(read('pages', 'settings', 'SettingsPage.tsx')).toMatch(/workspace\?\.user\??\.plan/);
    expect(read('pages', 'settings', 'SettingsPage.tsx')).not.toMatch(/\|\|\s*'Free'/);
    expect(read('components', 'native', 'AndroidSettingsScreen.tsx')).toMatch(/workspace\?\.user\??\.plan\s*\|\|\s*profile\?\.plan/);
  });
});

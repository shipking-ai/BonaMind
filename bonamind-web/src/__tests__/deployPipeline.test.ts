import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { findRedactedClientEnv, noRedactedEnv } from '../../vite-plugins/no-redacted-env';

/**
 * Production must get exactly one deploy per merge, built where the real
 * settings are.
 *
 * Until 2026-11-05 every merge to main was deployed twice: by Vercel's own Git
 * integration and by a GitHub Actions workflow (`deploy.yml`) that ran
 * `vercel pull` + `vercel build` + `vercel deploy --prebuilt --prod`.
 *
 * - The two raced, and the workflow ran one copy per merge side by side, so
 *   older commits sometimes went live after newer ones and open tabs lost
 *   their files.
 * - `vercel pull` can't read variables stored as Sensitive and writes
 *   `[SENSITIVE]` instead. The workflow's builds shipped that as the
 *   Turnstile site key, which broke password sign-in, sign-up and reset
 *   whenever the workflow's deploy happened to land last.
 *
 * Vercel's Git integration builds with the real values and only promotes the
 * newest commit, so it is now the only production deploy.
 */

const root = resolve(__dirname, '../../..');
const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as {
  git?: { deploymentEnabled?: boolean | Record<string, boolean> };
};
const workflowsDir = resolve(root, '.github/workflows');
const workflows = readdirSync(workflowsDir)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({ name: f, text: readFileSync(resolve(workflowsDir, f), 'utf8') }));

describe('production deploys', () => {
  it('leaves Vercel\'s Git integration on for main', () => {
    const enabled = vercel.git?.deploymentEnabled;
    expect(enabled === false || (typeof enabled === 'object' && enabled.main === false)).toBe(false);
  });

  it('has no GitHub workflow that deploys production as well', () => {
    const deployers = workflows.filter((w) => /vercel\s+deploy[^\n]*--prod/.test(w.text)).map((w) => w.name);
    expect(deployers).toEqual([]);
  });
});

describe('redacted settings', () => {
  it('finds VITE_ values that are Vercel\'s placeholder and nothing else', () => {
    expect(
      findRedactedClientEnv({
        VITE_TURNSTILE_SITE_KEY: '[SENSITIVE]',
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_EMPTY: '',
        STRIPE_SECRET_KEY: '[SENSITIVE]', // server-only, never bundled
      }),
    ).toEqual(['VITE_TURNSTILE_SITE_KEY']);
  });

  it('fails the build instead of shipping the placeholder', () => {
    const plugin = noRedactedEnv({ VITE_TURNSTILE_SITE_KEY: '[SENSITIVE]' });
    const error = vi.fn((message: string) => {
      throw new Error(message);
    });
    expect(plugin.apply).toBe('build');
    expect(() => (plugin.buildStart as (this: unknown) => void).call({ error })).toThrow(
      /VITE_TURNSTILE_SITE_KEY is "\[SENSITIVE\]"/,
    );
  });

  it('lets a normal build through', () => {
    const plugin = noRedactedEnv({ VITE_TURNSTILE_SITE_KEY: '0x4AAAAAAAexample' });
    const error = vi.fn();
    (plugin.buildStart as (this: unknown) => void).call({ error });
    expect(error).not.toHaveBeenCalled();
  });
});

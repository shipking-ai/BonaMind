import type { Plugin } from 'vite';

/**
 * Fails the build when a VITE_ setting arrived as Vercel's redaction
 * placeholder instead of its value.
 *
 * Vercel never hands back a variable stored as "Sensitive". `vercel pull`
 * writes the text `[SENSITIVE]` in its place, and a build made from that file
 * ships the placeholder to every browser. Until 2026-11-05 the GitHub Actions
 * deploy built this way, so bonamind.app shipped `[SENSITIVE]` as the
 * Turnstile site key and every password sign-in, sign-up and reset was stuck
 * behind "Couldn't load the verification check".
 *
 * VITE_ values are public by design (they ship in the bundle), so none of
 * them should be stored as Sensitive in the first place.
 */

export const REDACTED_PLACEHOLDER = '[SENSITIVE]';

/** The VITE_ keys whose value is the redaction placeholder, sorted. */
export function findRedactedClientEnv(env: Record<string, string | undefined>): string[] {
  return Object.keys(env)
    .filter((key) => key.startsWith('VITE_') && env[key]?.trim() === REDACTED_PLACEHOLDER)
    .sort();
}

export function noRedactedEnv(env: Record<string, string | undefined>): Plugin {
  return {
    name: 'bonamind:no-redacted-env',
    apply: 'build',
    buildStart() {
      const redacted = findRedactedClientEnv(env);
      if (redacted.length === 0) return;
      this.error(
        `${redacted.join(', ')} ${redacted.length === 1 ? 'is' : 'are'} "${REDACTED_PLACEHOLDER}", not a value. ` +
          'The build would ship that text to every browser. Vercel never returns a variable ' +
          'stored as Sensitive, so a build made from `vercel pull` gets this placeholder. ' +
          'Store VITE_ variables as plain (they are public anyway) or build on Vercel.',
      );
    },
  };
}

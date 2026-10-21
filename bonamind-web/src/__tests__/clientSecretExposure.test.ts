import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Vite inlines every `VITE_`-prefixed env var into the browser bundle at
 * build time, so anything reachable through one is public. A provider API
 * key behind that prefix is a spendable credential handed to every visitor.
 *
 * Two distinct mechanisms leak it, and both are covered here:
 *
 *   1. A static read — `import.meta.env.VITE_GROQ_API_KEY` — is substituted
 *      with the literal value wherever it appears.
 *   2. A dynamic read — `import.meta.env[name]` — cannot be analysed, so
 *      Vite gives up and inlines the ENTIRE env object, publishing every
 *      VITE_ var at once regardless of which ones code actually reads.
 *
 * Guarding either with `import.meta.env.DEV` does NOT help: the value is
 * embedded at build time whichever branch runs. That was tried and the key
 * still shipped. Omission from the `CLIENT_ENV` allowlist in lib/env.ts is
 * the only reliable control.
 */

const SRC = path.resolve(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf8');

const PROVIDER_SECRETS = [
  'VITE_GROQ_API_KEY',
  'VITE_GEMINI_API_KEY',
  'VITE_SCHOOLOGY_CONSUMER_KEY',
  'VITE_SCHOOLOGY_CONSUMER_SECRET',
];

/** Every .ts/.tsx under src/, excluding test files. */
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** True if any non-comment line of `file` matches `pattern`. */
function hasCodeMatch(file: string, pattern: RegExp): boolean {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .some((line) => {
      const t = line.trimStart();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return false;
      return pattern.test(line);
    });
}

describe('client bundle does not ship provider credentials', () => {
  it('keeps provider keys out of the client env allowlist', () => {
    const envSrc = read('lib', 'env.ts');
    const map = envSrc.slice(
      envSrc.indexOf('const CLIENT_ENV'),
      envSrc.indexOf('export function readClientEnv'),
    );
    expect(map.length, 'could not locate the CLIENT_ENV map').toBeGreaterThan(0);

    for (const secret of PROVIDER_SECRETS) {
      const isEntry = new RegExp('^\\s*' + secret + '\\s*:', 'm').test(map);
      expect(isEntry, secret + ' must not be an entry in CLIENT_ENV').toBe(false);
    }
  });

  it('never reads a provider key as a static import.meta.env property', () => {
    const pattern = /import\.meta\.env\.VITE_(GROQ_API_KEY|GEMINI_API_KEY|SCHOOLOGY_[A-Z_]+)/;
    const offenders = sourceFiles(SRC).filter((f) => hasCodeMatch(f, pattern));
    expect(offenders, 'provider key read statically: ' + offenders.join(', ')).toEqual([]);
  });

  it('does not index import.meta.env dynamically outside the allowlist', () => {
    // env.ts owns the single allowlisted accessor; everywhere else must go
    // through readClientEnv so no whole-object inline is ever triggered.
    const pattern = /import\.meta(\s+as\s+any)?\s*\)?\.env\s*(\?\.)?\[/;
    const offenders = sourceFiles(SRC)
      .filter((f) => path.basename(f) !== 'env.ts')
      .filter((f) => hasCodeMatch(f, pattern));
    expect(
      offenders,
      'dynamic import.meta.env indexing inlines all VITE_ vars: ' + offenders.join(', '),
    ).toEqual([]);
  });

  it('routes signed-in AI traffic through the server proxy, not api.groq.com', () => {
    const src = read('services', 'api', 'groqClient.ts');
    // The proxy base is origin-aware rather than a bare '/api/ai': inside the
    // Capacitor webview the origin is https://localhost, so a relative path
    // would send every AI request to the device. Assert the shape, not a
    // literal, so the path stays checked without pinning the exact string.
    expect(src).toMatch(/PROXY_BASE_URL = `\$\{[^}]*\}\/api\/ai`/);
    expect(src).toContain("VITE_API_BASE_URL");
    expect(src).toMatch(/if \(localAI\)[\s\S]{0,400}else if \(token\)[\s\S]{0,160}PROXY_BASE_URL/);
  });

  it('reports no client-held Groq key, so callers fall through to Puter or offline', () => {
    const envSrc = read('lib', 'env.ts');
    const fn = envSrc.slice(envSrc.indexOf('export function hasValidGroqKey'));
    expect(fn.slice(0, fn.indexOf('}') + 1)).toMatch(/return false;/);
  });

  it('keeps server-only secrets off the VITE_ prefix entirely', () => {
    // CLAUDE.md: server-only keys must never be VITE_-prefixed, because that
    // prefix is exactly what publishes them to the browser.
    const pattern = /VITE_(RESEND|STRIPE_SECRET|SUPABASE_SERVICE|GOOGLE_SEARCH)[A-Z_]*/;
    const offenders = sourceFiles(SRC).filter((f) => hasCodeMatch(f, pattern));
    expect(
      offenders,
      'server-only secrets behind a VITE_ prefix: ' + offenders.join(', '),
    ).toEqual([]);
  });
});

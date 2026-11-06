/**
 * Guards the Schoology hide-out. The integration could never work as
 * shipped: the OAuth 1.0 signature was sent as a Promise (two unawaited
 * async calls), the digest was base64url instead of standard base64, and
 * the consumer secret was expected in the browser bundle — a spendable
 * credential Vite publishes to every visitor. Until a server-side OAuth
 * implementation exists, no part of the app may advertise or reference
 * Schoology.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '..');

/** Every .ts/.tsx under src/, excluding test files. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe('schoology is hidden until server-side OAuth exists', () => {
  it('no file under src/ mentions Schoology', () => {
    const offenders = sourceFiles(SRC).filter((f) => /schoology/i.test(readFileSync(f, 'utf8')));
    expect(
      offenders.map((f) => path.relative(SRC, f)),
      'schoology references found in client code',
    ).toEqual([]);
  });

  it('the broken client-side OAuth artifacts are gone', () => {
    expect(existsSync(path.join(SRC, 'services/integrations/schoologyService.ts'))).toBe(false);
    expect(existsSync(path.join(SRC, 'pages/auth/SchoologyCallbackPage.tsx'))).toBe(false);
  });

  it('the Terms and docs no longer advertise the integration', () => {
    const terms = readFileSync(path.join(SRC, 'pages/legal/TermsOfServicePage.tsx'), 'utf8');
    const docs = readFileSync(path.join(SRC, 'pages/legal/DocsPage.tsx'), 'utf8');
    expect(terms).not.toMatch(/schoology/i);
    expect(docs).not.toMatch(/schoology/i);
  });
});

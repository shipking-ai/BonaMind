/**
 * Guards the app version against the "2.0.0 is hardcoded somewhere" class of
 * drift. A real one shipped: three displays claimed the app was v2.0.0 while
 * package.json said 2.3.6. The version now flows from package.json through a
 * vite define into the client env allowlist, and these tests pin both sides.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../lib/env';

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
) as { version: string };

const VERSION_DISPLAYS = [
  'src/hooks/useNative.ts',
  'src/lib/nativeShim.ts',
  'src/pages/system/AboutPage.tsx',
];

describe('the app version single source', () => {
  it('reaches the client as the package.json version', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('carries no hardcoded stale version in any display', () => {
    for (const file of VERSION_DISPLAYS) {
      const source = readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
      expect(source, `${file} must not hardcode an app version`).not.toMatch(
        /['"]\d+\.\d+\.\d+['"]/,
      );
    }
  });
});

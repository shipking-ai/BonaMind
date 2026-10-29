/**
 * Guards Dependabot against watching a folder that no longer exists.
 *
 * The old `auramind-gemini/` folder was renamed to `bonamind-web/` in
 * 7d7c361d. Dependabot kept opening PRs against the dead folder (issues
 * #195, #183, #166, #159, #158, #151 — all closed as superseded) that could
 * never merge. This pins the config to the real folder so a rename can
 * never strand dependency updates again without a test failing.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const CONFIG = readFileSync(path.join(ROOT, '.github/dependabot.yml'), 'utf8');

describe('dependabot watches the folders that exist', () => {
  it('never references the retired auramind-gemini folder', () => {
    expect(CONFIG).not.toMatch(/auramind-gemini/);
  });

  it('watches the renamed bonamind-web folder', () => {
    expect(CONFIG).toMatch(/directory:\s*"\/bonamind-web"/);
  });
});

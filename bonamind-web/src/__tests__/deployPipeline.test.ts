import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Production must get exactly one deploy per merge, and the newest merge must
 * be the last one to go live.
 *
 * On 2026-11-05 every merge to main was deployed twice: once by Vercel's own
 * Git integration and once by .github/workflows/deploy.yml. The workflow also
 * ran one copy per merge side by side, so after seven quick merges the builds
 * finished in any order and older commits went live after newer ones. Each
 * build has different file names, so every switch broke open tabs, and one
 * left a blank page.
 */

const root = resolve(__dirname, '../../..');
const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as {
  git?: { deploymentEnabled?: Record<string, boolean> };
};
const workflow = readFileSync(resolve(root, '.github/workflows/deploy.yml'), 'utf8');

describe('production deploys', () => {
  it("leaves main to the Deploy workflow instead of also using Vercel's Git integration", () => {
    expect(vercel.git?.deploymentEnabled?.main).toBe(false);
  });

  it('runs one Deploy at a time, without killing one that is mid-deploy', () => {
    // Top-level (unindented) so it covers the whole workflow, not one job.
    expect(workflow).toMatch(/^concurrency:\s*\n\s+group:\s*\S+/m);
    expect(workflow).toMatch(/^\s+cancel-in-progress:\s*false\s*$/m);
  });

  it('still deploys main on push', () => {
    expect(workflow).toMatch(/push:\s*\n\s+branches:\s*\[main\]/);
    expect(workflow).toContain('vercel deploy --prebuilt --prod');
  });
});

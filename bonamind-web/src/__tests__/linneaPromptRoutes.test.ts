/**
 * Guard: every /dashboard/... path Linnea's built-in app guide mentions must
 * be a route the app actually serves.
 *
 * A real regression shipped here: the prompt described /dashboard/cards and
 * /dashboard/lessons, neither of which existed, so the links Linnea
 * suggested led nowhere.
 *
 * The test is deliberately tied to the RUNNING router: it derives the
 * declared routes from NovaHub.tsx (the dashboard route table) and asserts
 * the prompt mentions nothing outside them. When someone adds, renames or
 * removes a route, the prompt has to follow — and this test says so.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STUDY_AGENT_SYSTEM_PROMPT } from '../services/api/bonaAiService';

const HUB = readFileSync(path.join(__dirname, '../pages/dashboard/NovaHub.tsx'), 'utf8');

/** Absolute /dashboard/... routes declared by the dashboard router. */
function declaredRoutes(): Set<string> {
  const declared = new Set<string>(['/dashboard']);
  for (const match of HUB.matchAll(/path="([^"]+)"/g)) {
    const routePath = match[1];
    if (routePath.includes('*')) continue; // catch-all, not a destination
    declared.add(`/dashboard${routePath === '/' ? '' : routePath}`);
  }
  return declared;
}

describe("Linnea's app-guide prompt", () => {
  it('never mentions a /dashboard path the router does not serve', () => {
    const mentioned = new Set(
      STUDY_AGENT_SYSTEM_PROMPT.match(/\/dashboard[^\s`*.,;'"()]*/g) ?? [],
    );
    expect(mentioned.size, 'the guide should still name app pages').toBeGreaterThan(0);
    // The known-fake paths if they ever sneak back in.
    expect(mentioned, '/dashboard/cards does not exist (it is /dashboard/decks)').not.toContain(
      '/dashboard/cards',
    );
    expect(mentioned, '/dashboard/lessons does not exist').not.toContain('/dashboard/lessons');
    for (const routePath of mentioned) {
      expect(
        declaredRoutes(),
        `the guide references ${routePath}, which the dashboard router does not declare`,
      ).toContain(routePath);
    }
  });
});

/**
 * Guards the marketing and legal pages against advertising features that do
 * not ship.
 *
 * Real false claims shipped: the landing comparison said BonaMind imports
 * Anki decks (.apkg), the docs described a Notion import, the terms promised
 * Notion/Obsidian/Anki-APKG integrations, and an achievement advertised
 * linking a Notion account (the achievement itself was never grantable).
 * None of those features exist in the code.
 *
 * Scope is deliberate: these expressions stay legal in files where they name
 * *real* code (the Windows app signs in with a Notion OAuth provider, and
 * roadmapService has a true Quizlet-format text importer), so only the
 * files that advertise features are scanned.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const read = (...parts: string[]): string => readFileSync(path.join(WEB, ...parts), 'utf8');

describe('the features the site advertises', () => {
  it('the landing comparison does not claim an Anki .apkg importer', () => {
    const page = read('components/landing/ComparisonSection.tsx');
    expect(page).not.toMatch(/\.apkg/i);
    expect(page).not.toMatch(/Bring your Anki decks/i);
  });

  it('the docs do not describe a Notion import', () => {
    const page = read('pages/legal/DocsPage.tsx');
    expect(page).not.toMatch(/\bNotion\b/);
  });

  it('the terms do not promise Notion, Obsidian or Anki-APKG integrations', () => {
    const page = read('pages/legal/TermsOfServicePage.tsx');
    expect(page).not.toMatch(/\bNotion\b/i);
    expect(page).not.toMatch(/\bObsidian\b/i);
    expect(page).not.toMatch(/\bAPKG\b/i);
  });

  it('no achievement advertises linking an integration account', () => {
    const page = read('components/achievements/AchievementUnlock.tsx');
    expect(page).not.toMatch(/\bNotion\b/i);
    expect(page).not.toMatch(/Link your Schoology/);
  });
});

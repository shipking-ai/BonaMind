/**
 * Guards the Android store text against false privacy claims.
 *
 * Real false claims shipped: release notes said Prof. Linnea runs on-device
 * with "no servers, no data leaving your device" (chat defaults to the
 * cloud proxy), the listing said decks "stay on your device" (they live in
 * the user's account), and the data-safety draft only disclosed audio even
 * though chat text, card context and course photos also reach AI providers
 * through the server.
 *
 * Like the native-source tests, these read text rather than run an app —
 * they fail loudly on the specific regressions, not on the whole world.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const STORE = path.resolve(__dirname, '../../../store/android');
const read = (...parts: string[]): string => readFileSync(path.join(STORE, ...parts), 'utf8');

describe('the Android store text', () => {
  it('release notes do not claim the default assistant runs without servers', () => {
    const changelog = read('changelogs', 'en-US.txt');
    expect(changelog).not.toMatch(/no servers, no data leaving your device/i);
    expect(changelog).not.toMatch(/ON YOUR PHONE/i);
  });

  it('the listing never claims decks and notes live only on the device', () => {
    const listing = read('listing.md');
    expect(listing).not.toMatch(/stay on your device/i);
    expect(listing).not.toMatch(/all your decks live on your device/i);
  });

  it('discloses every AI-shared surface in the data-safety draft', () => {
    const forms = read('PLAY_CONSOLE_FORMS.md');
    expect(forms).toMatch(/Text.*shared off-device/s);
    expect(forms).toMatch(/Images.*shared off-device/s);
    expect(forms).toMatch(/Groq, Cerebras, Google Gemini or OpenRouter/);
    expect(forms).toMatch(/chat_logs/);
  });
});

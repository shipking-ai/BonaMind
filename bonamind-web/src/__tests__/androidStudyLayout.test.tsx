import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// The Android app draws the browser's study page, restyled for a phone by
// .android-study-page rules. Things added to the browser page later landed on
// the phone unstyled (seen on a Pixel emulator): the multiplayer banner ran
// under the status bar, the desk video washed over the header, and the voice
// buttons sat under the gesture bar, where a tap selected their label text
// instead of starting the microphone.

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));
vi.mock('../lib/nativeShim', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    isPluginAvailable: () => false,
  },
  App: { addListener: async () => ({ remove: () => undefined }) },
  Preferences: { get: async () => ({ value: null }), set: async () => undefined },
}));
vi.mock('../hooks/useCurrentUserId', () => ({ useCurrentUserId: () => 'user-1' }));
vi.mock('../hooks/useMultiplayerStudy', () => ({
  useMultiplayerStudy: () => ({ peers: [], connected: false, sendGrade: () => undefined }),
}));
vi.mock('../lib/offlineAwareData', () => ({
  loadOfflineAwareData: async () => ({
    decks: [{ id: 'deck-1', title: 'How memory works', userId: 'user-1' }],
    cards: [
      {
        id: 'card-1',
        deckId: 'deck-1',
        front: 'What does stability mean?',
        back: 'How long a memory lasts.',
        nextReview: 0,
      },
    ],
  }),
}));

const css = fs
  .readFileSync(path.resolve(__dirname, '../styles/platform-styles.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of every rule whose selector list contains `selector`. */
function rulesFor(selector: string): string {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    if (m[1].split(',').some((s) => s.trim() === selector)) out.push(m[2]);
  }
  return out.join('\n');
}

describe('Android study session layout', () => {
  beforeAll(() => {
    // jsdom's play() returns undefined; the browser's returns a promise.
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: () => Promise.resolve(),
    });
    return import('../pages/study/StudyModePage');
  }, 240000);

  const mount = async () => {
    window.history.pushState({}, '', '/dashboard/study/deck-1?voice=1');
    const { default: StudyModePage } = await import('../pages/study/StudyModePage');
    const view = render(
      <MemoryRouter initialEntries={['/dashboard/study/deck-1?voice=1']}>
        <Routes>
          <Route path="/dashboard/study/:deckId" element={<StudyModePage />} />
        </Routes>
      </MemoryRouter>,
    );
    await view.findAllByText('What does stability mean?', undefined, { timeout: 10000 });
    return view;
  };

  it('plays no background video over the phone layout', async () => {
    const view = await mount();
    expect(view.container.querySelector('video')).toBeNull();
    view.unmount();
  }, 20000);

  it('puts the header, which carries the status-bar inset, above the multiplayer banner', async () => {
    const view = await mount();
    const header = view.container.querySelector('.android-study-header');
    const banner = view.getByText('Study with others');
    expect(header).not.toBeNull();
    expect(header!.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    view.unmount();
  }, 20000);

  it('keeps the voice buttons from selecting their label text', async () => {
    const view = await mount();
    const answer = view.getByText('Answer Aloud').closest('button')!;
    expect(answer.closest('.select-none')).not.toBeNull();
    view.unmount();
  }, 20000);

  it('clears the gesture bar under the voice panel and fits the orb on a phone', () => {
    expect(rulesFor('.android-study-page .android-study-voice-panel:last-child')).toMatch(
      /padding-bottom:\s*calc\([^;]*env\(safe-area-inset-bottom/,
    );
    expect(rulesFor('.android-study-page .android-study-voice-panel .am-voice-orb')).toMatch(/width:/);
  });
});

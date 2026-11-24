import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// The Android app used to draw the browser's study page, restyled by CSS,
// so everything added to the browser session (the multiplayer banner, the
// desk video, Flow Mode) reached the phone unstyled. It now gets its own
// screen, as iPhone and Windows do.

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));
vi.mock('../lib/nativeShim', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    isPluginAvailable: () => false,
  },
  App: { addListener: async () => ({ remove: () => undefined }) },
  Preferences: { get: async () => ({ value: null }), set: async () => undefined },
  Haptics: { impact: async () => undefined, selectionStart: async () => undefined },
  ImpactStyle: { Light: 'LIGHT' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
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

describe('the study session in the Android app', () => {
  beforeAll(() => {
    // jsdom's play() returns undefined; the browser's returns a promise.
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: () => Promise.resolve(),
    });
    return import('../pages/study/StudyModePage');
  }, 240000);

  const mount = async (url = '/dashboard/study/deck-1') => {
    window.history.pushState({}, '', url);
    const { default: StudyModePage } = await import('../pages/study/StudyModePage');
    const view = render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/dashboard/study/:deckId" element={<StudyModePage />} />
        </Routes>
      </MemoryRouter>,
    );
    await view.findByTestId('android-study-session', undefined, { timeout: 10000 });
    return view;
  };

  it('draws the Android session screen, not the restyled browser layout', async () => {
    const view = await mount();
    expect(view.getAllByText('What does stability mean?').length).toBeGreaterThan(0);
    expect(view.container.querySelector('.android-study-page')).toBeNull();
    expect(view.container.querySelector('video')).toBeNull();
    expect(view.queryByText('Study with others')).toBeNull();
    expect(view.queryByText('Flow Mode')).toBeNull();
    view.unmount();
  }, 20000);

  it('shows the answer and the grades after a tap', async () => {
    const view = await mount();
    fireEvent.click(view.getByRole('button', { name: 'Show answer' }));
    expect(await view.findByText('How long a memory lasts.')).toBeTruthy();
    expect(view.getByRole('button', { name: /Good/ })).toBeTruthy();
    view.unmount();
  }, 20000);

  it('opens with the voice panel when started hands-free', async () => {
    const view = await mount('/dashboard/study/deck-1?voice=1');
    expect(view.getByText('Answer Aloud')).toBeTruthy();
    view.unmount();
  }, 20000);
});

/**
 * The Android app's own study session: one focused screen, like iPhone's.
 * StudyModePage owns grading and saving; this screen only draws the card and
 * reports taps and swipes. These pin what it reports.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Rating, type Card } from '../types';

vi.mock('../lib/nativeShim', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'android' },
  Haptics: {},
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
}));

import { AndroidStudyComplete, AndroidStudySession } from '../components/native/AndroidStudySession';

const card = {
  id: 'card-1',
  deckId: 'deck-1',
  front: 'What does stability mean?',
  back: 'How long a memory lasts.',
} as Card;

function renderSession(overrides: Partial<React.ComponentProps<typeof AndroidStudySession>> = {}) {
  const props = {
    deckTitle: 'How memory works',
    deckId: 'deck-1',
    card,
    index: 2,
    total: 8,
    flipped: false,
    onFlip: vi.fn(),
    onRate: vi.fn(),
    onExit: vi.fn(),
    intervals: {} as Partial<Record<Rating, number>>,
    voiceMode: false,
    onToggleVoice: vi.fn(),
    ...overrides,
  };
  return { props, view: render(<AndroidStudySession {...props} />) };
}

describe('AndroidStudySession', () => {
  it('shows the deck, the position and the question, and flips on a tap', () => {
    const { props } = renderSession();
    expect(screen.getByTestId('android-study-session')).toBeTruthy();
    expect(screen.getByRole('banner').textContent).toContain('How memory works');
    expect(screen.getByText('3 of 8')).toBeTruthy();
    expect(screen.getAllByText('What does stability mean?').length).toBeGreaterThan(0);
    expect(screen.getByText('Tap the card to see the answer')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Good/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(props.onFlip).toHaveBeenCalledTimes(1);
  });

  it('grades once per tap with the right rating, showing when each card returns', () => {
    const onRate = vi.fn();
    renderSession({
      flipped: true,
      onRate,
      intervals: { [Rating.AGAIN]: 0.007, [Rating.HARD]: 1, [Rating.GOOD]: 3, [Rating.EASY]: 8 },
    });
    expect(screen.getByRole('button', { name: /Good/ }).textContent).toContain('3d');
    expect(screen.getByRole('button', { name: /Easy/ }).textContent).toContain('8d');

    const cases: Array<[RegExp, Rating]> = [
      [/Again/, Rating.AGAIN],
      [/Hard/, Rating.HARD],
      [/Good/, Rating.GOOD],
      [/Easy/, Rating.EASY],
    ];
    for (const [name, rating] of cases) {
      onRate.mockClear();
      fireEvent.click(screen.getByRole('button', { name }));
      expect(onRate).toHaveBeenCalledTimes(1);
      expect(onRate).toHaveBeenCalledWith(rating);
    }
  });

  it('does not flip again or grade from a tap on the answer side', () => {
    const { props } = renderSession({ flipped: true });
    expect(screen.queryByRole('button', { name: 'Show answer' })).toBeNull();
    expect(props.onFlip).not.toHaveBeenCalled();
    expect(props.onRate).not.toHaveBeenCalled();
  });

  it('ends the session and toggles voice from the header', () => {
    const { props } = renderSession({ voiceMode: true });
    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    expect(props.onExit).toHaveBeenCalledTimes(1);
    const mic = screen.getByRole('button', { name: 'Turn off voice study' });
    expect(mic.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(mic);
    expect(props.onToggleVoice).toHaveBeenCalledTimes(1);
  });

  it('shows the voice panel when one is given', () => {
    renderSession({ voiceMode: true, voicePanel: <div>voice panel here</div> });
    expect(screen.getByText('voice panel here')).toBeTruthy();
  });

  it('reads cards that only have question and answer fields', () => {
    renderSession({
      flipped: true,
      card: { id: 'c2', deckId: 'deck-1', question: 'Old question', answer: 'Old answer' } as Card,
    });
    expect(screen.getAllByText('Old question').length).toBeGreaterThan(0);
    expect(screen.getByText('Old answer')).toBeTruthy();
  });
});

describe('AndroidStudyComplete', () => {
  it('sums up the session and offers Done and Study again', () => {
    const onDone = vi.fn();
    const onRestart = vi.fn();
    render(
      <AndroidStudyComplete
        deckTitle="How memory works"
        reviewed={8}
        correct={6}
        elapsedMs={125_000}
        onRestart={onRestart}
        onDone={onDone}
      />,
    );
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('2:05')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Study again' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});

// Two things only a real phone showed (Pixel emulator, debug build):
//  - The card and its answer are scroll containers, which stops the wrapper's
//    touch-action: none from reaching them, so the WebView took every swipe
//    as a scroll and the card never graded.
//  - On a touch screen a tapped button stays :hover, and the app-wide Android
//    state layer (button::after, inset: 0) then sits on the nearest
//    positioned ancestor: after tapping the mic, the whole session was
//    washed 10% white.
describe('Android session stylesheet', () => {
  const read = (f: string) =>
    fs
      .readFileSync(path.resolve(__dirname, '../styles', f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  const androidCss = read('android-native.css');
  const platformCss = read('platform-styles.css');

  /** Declarations of every rule whose selector list includes `selector`. */
  const rulesFor = (css: string, selector: string) => {
    const out: string[] = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
      if (m[1].split(',').some((x) => x.trim() === selector)) out.push(m[2]);
    }
    return out.join('\n');
  };

  it('hands every touch on the shown answer to the swipe, except vertical scrolling of a long answer', () => {
    expect(rulesFor(androidCss, '.android-session-card-wrap.is-flipped *')).toMatch(/touch-action:\s*none/);
    expect(rulesFor(androidCss, '.android-session-card-wrap.is-flipped .android-session-card-answer')).toMatch(
      /touch-action:\s*pan-y/,
    );
  });

  it('keeps the pressed layer of each button inside that button', () => {
    for (const sel of [
      '.android-session-round',
      '.android-session-grade',
      '.android-session-card',
      '.android-session-primary',
      '.android-session-secondary',
    ]) {
      expect(rulesFor(androidCss, sel), sel).toMatch(/position:\s*relative/);
    }
  });

  it('shows the hover layer only where there is real hover, so a tap does not leave it on', () => {
    expect(platformCss).toMatch(
      /@media\s*\(hover:\s*hover\)\s*\{\s*\.platform-android button:hover::after,\s*\.platform-android \[role="button"\]:hover::after\s*\{\s*opacity:\s*1;?\s*\}\s*\}/,
    );
  });
});

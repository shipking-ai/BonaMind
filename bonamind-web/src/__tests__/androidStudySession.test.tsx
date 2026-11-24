/**
 * The Android app's own study session: one focused screen, like iPhone's.
 * StudyModePage owns grading and saving; this screen only draws the card and
 * reports taps and swipes. These pin what it reports.
 */
import React from 'react';
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

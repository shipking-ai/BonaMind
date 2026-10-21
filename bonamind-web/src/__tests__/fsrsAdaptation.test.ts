import { describe, it, expect } from 'vitest';
import {
  applyPersonalizedDifficultyInit,
  PROFILE_DIFFICULTY_CENTER,
} from '../services/study/fsrs';
import { DEFAULT_WEIGHTS } from '../services/study/fsrs';
import type { Card, FSRSState } from '../types';

function freshCard(): Card {
  return {
    id: 'card-1',
    deckId: 'deck-1',
    front: 'Q',
    back: 'A',
    repetition: 0,
      fsrsState: undefined,
  } as Card;
}

function withFsrsState(difficulty: number, repetitions = 0, lastReview = 0): Card {
  const state: FSRSState = {
    stability: 1.0,
    difficulty,
    elapsedDays: 0,
    scheduledDays: 0,
    repetitions,
    lapses: 0,
    lastReview,
  };
  return { ...freshCard(), fsrsState: state };
}

describe('applyPersonalizedDifficultyInit', () => {
  it('applies moderate difficulty when no profile label is provided', () => {
    const result = applyPersonalizedDifficultyInit(freshCard(), null);
    expect(result.applied).toBe(true);
    expect(result.card.fsrsState?.difficulty).toBeCloseTo(DEFAULT_WEIGHTS[4], 4);
  });

  it('maps fast-learner to the easier 4.5 center', () => {
    const result = applyPersonalizedDifficultyInit(freshCard(), 'fast-learner');
    expect(result.applied).toBe(true);
    expect(result.card.fsrsState?.difficulty).toBe(4.5);
  });

  it('maps tough-learner to the harder 7.5 center', () => {
    const result = applyPersonalizedDifficultyInit(freshCard(), 'tough-learner');
    expect(result.applied).toBe(true);
    expect(result.card.fsrsState?.difficulty).toBe(7.5);
  });

  it('maps conservative to the easier 5 center', () => {
    const result = applyPersonalizedDifficultyInit(freshCard(), 'conservative');
    expect(result.card.fsrsState?.difficulty).toBe(5);
  });

  it('preserves every supported profile label', () => {
    const labels = [
      'aggressive',
      'moderate',
      'conservative',
      'fast-learner',
      'tough-learner',
      'visual-dominant',
    ];
    for (const label of labels) {
      expect(typeof PROFILE_DIFFICULTY_CENTER[label]).toBe('number');
      const result = applyPersonalizedDifficultyInit(freshCard(), label);
      expect(result.applied).toBe(true);
    }
  });

  it('returns no-op when card already has repetitions > 0', () => {
    const midLife = withFsrsState(7.5, 3);
    const result = applyPersonalizedDifficultyInit(midLife, 'fast-learner');
    expect(result.applied).toBe(false);
    expect(result.card.fsrsState?.difficulty).toBe(7.5);
    expect(result.card.fsrsState?.repetitions).toBe(3);
  });

  it('returns no-op when current difficulty already matches the target', () => {
    const alreadyBiased = withFsrsState(4.5);
    const result = applyPersonalizedDifficultyInit(alreadyBiased, 'fast-learner');
    expect(result.applied).toBe(false);
    expect(result.card.fsrsState?.difficulty).toBe(4.5);
  });

  it('uses the weightsOverride for initial stability when provided', () => {
    const custom = [9.0, ...DEFAULT_WEIGHTS.slice(1)];
    const result = applyPersonalizedDifficultyInit(freshCard(), 'moderate', custom);
    expect(result.card.fsrsState?.stability).toBe(9.0);
  });

  it('preserves lastReview when applying the bias over an existing state', () => {
    const previous = withFsrsState(7.21, 0, 1_700_000_000_000);
    const result = applyPersonalizedDifficultyInit(previous, 'fast-learner');
    expect(result.applied).toBe(true);
    expect(result.card.fsrsState?.difficulty).toBe(4.5);
    expect(result.card.fsrsState?.lastReview).toBe(1_700_000_000_000);
  });
});

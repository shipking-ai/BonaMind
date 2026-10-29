// Pure unit tests for the performance stats that Aura references in the
// tutor prompt (retention7d, lastSessionAccuracy). No Supabase needed —
// these run in CI on every push.
import { describe, expect, it } from 'vitest';
import { deriveLastSessionAccuracy, deriveRetention7d } from '../hooks/useStudyStats';
import type { StudySession } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

function session(startTime: number, overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: 's',
    userId: 'u',
    startTime,
    cardsStudied: 0,
    accuracy: 0,
    ...overrides,
  };
}

describe('deriveRetention7d', () => {
  it('returns undefined with no sessions', () => {
    expect(deriveRetention7d([])).toBeUndefined();
  });

  it('computes correct/total across sessions within the last 7 days', () => {
    const now = Date.now();
    const sessions = [
      session(now - DAY_MS, { totalAnswers: 10, correctAnswers: 8 }),
      session(now - 2 * DAY_MS, { totalAnswers: 5, correctAnswers: 4 }),
    ];
    expect(deriveRetention7d(sessions)).toBeCloseTo(12 / 15, 5);
  });

  it('excludes sessions older than 7 days', () => {
    const now = Date.now();
    const sessions = [
      session(now - 8 * DAY_MS, { totalAnswers: 100, correctAnswers: 100 }),
      session(now - 2 * DAY_MS, { totalAnswers: 4, correctAnswers: 2 }),
    ];
    expect(deriveRetention7d(sessions)).toBeCloseTo(0.5, 5);
  });

  it('falls back to the 0-100 accuracy column when exact counts are absent', () => {
    const now = Date.now();
    const sessions = [
      session(now - DAY_MS, { cardsStudied: 10, accuracy: 80 }),
    ];
    expect(deriveRetention7d(sessions)).toBeCloseTo(0.8, 5);
  });

  it('prefers exact counts over the accuracy column when both exist', () => {
    const now = Date.now();
    const sessions = [
      session(now - DAY_MS, { cardsStudied: 10, totalAnswers: 4, correctAnswers: 1, accuracy: 90 }),
    ];
    expect(deriveRetention7d(sessions)).toBeCloseTo(0.25, 5);
  });

  it('ignores sessions with no answer data', () => {
    const now = Date.now();
    const sessions = [session(now - DAY_MS, { cardsStudied: 0 })];
    expect(deriveRetention7d(sessions)).toBeUndefined();
  });
});

describe('deriveLastSessionAccuracy', () => {
  it('returns undefined with no sessions', () => {
    expect(deriveLastSessionAccuracy([])).toBeUndefined();
  });

  it('returns the accuracy of the newest (first) session', () => {
    const now = Date.now();
    const sessions = [
      session(now - DAY_MS, { accuracy: 92 }),
      session(now - 2 * DAY_MS, { accuracy: 60 }),
    ];
    expect(deriveLastSessionAccuracy(sessions)).toBe(92);
  });
});

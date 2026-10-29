import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyWatchGrade } from '../services/wear/wearGradeService';
import type { Card } from '../types';

const card = (id: string): Card => ({
  id, deckId: 'd1', front: 'q', back: 'a', repetition: 0, nextReview: 0, lastReviewed: 0,
} as Card);

vi.mock('../services/database/dbService', () => ({
  dbService: { updateCard: vi.fn(async () => ({})) },
}));
vi.mock('../services/offline/offlineStudyService', () => ({
  isOnline: vi.fn(() => true),
  queueCardReview: vi.fn(async () => {}),
}));
vi.mock('../services/database/modules/cardReviewsService', () => ({
  cardReviewsService: { recordReview: vi.fn(() => ({ catch: () => {} })) },
}));

beforeEach(() => vi.clearAllMocks());

describe('applyWatchGrade', () => {
  it('applies a rating exactly once per (sessionId, cardId)', async () => {
    const grade = { sessionId: 's1', cardId: 'c1', rating: 2 as const, timestamp: 1 };
    const cards = [card('c1')];
    const first = await applyWatchGrade({ grade, cards, userId: 'u1' });
    const second = await applyWatchGrade({ grade, cards, userId: 'u1' });
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
  });

  it('does nothing for an unknown card', async () => {
    const grade = { sessionId: 's1', cardId: 'nope', rating: 0 as const, timestamp: 1 };
    expect((await applyWatchGrade({ grade, cards: [card('c1')], userId: 'u1' })).applied).toBe(false);
  });
});

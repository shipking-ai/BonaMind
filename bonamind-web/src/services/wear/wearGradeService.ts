import type { Card } from '../../types';
import { calculateSRS } from '../../services/study/srs';
import { persistReview } from '../../services/study/persistReview';
import { cardReviewsService } from '../../services/database/modules/cardReviewsService';
import { wireRatingToAppRating, type GradeResult } from './wearPayload';

const appliedKeys = new Set<string>();
// Bound the dedupe set — keys are only needed while a watch session is in
// flight; old sessions' keys never matter again. Prevents unbounded growth
// during a very long app session.
const APPLIED_KEYS_MAX = 5000;

function rememberApplied(sessionId: string, cardId: string): boolean {
  const key = `${sessionId}:${cardId}`;
  if (appliedKeys.has(key)) return false;
  if (appliedKeys.size >= APPLIED_KEYS_MAX) appliedKeys.clear();
  appliedKeys.add(key);
  return true;
}

export async function applyWatchGrade(args: {
  grade: GradeResult;
  cards: Card[];
  userId: string;
  weights?: number[];
  targetRetention?: number;
}): Promise<{ applied: boolean }> {
  const { grade, cards, userId } = args;
  if (!rememberApplied(grade.sessionId, grade.cardId)) return { applied: false };

  const card = cards.find((c) => c.id === grade.cardId);
  if (!card) return { applied: false };

  const rating = wireRatingToAppRating(grade.rating);
  const res = calculateSRS(card, rating, args.weights ?? [], args.targetRetention ?? 0.85);
  const reviewedAt = Date.now();
  const update: Partial<Card> = {
    // interval was missing, so a watch grade moved next_review but left the
    // stored interval at its old value.
    interval: res.interval,
    repetition: res.repetition,
    easeFactor: res.easeFactor,
    nextReview: reviewedAt + res.interval * 86400000,
    lastReviewed: reviewedAt,
  };
  if (res.fsrsState) update.fsrsState = res.fsrsState;

  await persistReview({ cardId: card.id, rating, srsResult: res, update, userId, reviewedAt });
  cardReviewsService.recordReview({
    userId,
    cardId: card.id,
    rating,
    srsResult: {
      interval: res.interval,
      repetition: res.repetition,
      easeFactor: res.easeFactor,
      fsrsState: res.fsrsState,
    },
    reviewedAt,
  }).catch(() => {});
  return { applied: true };
}

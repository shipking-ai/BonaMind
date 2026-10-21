import type { Card } from '../../types';
import { calculateSRS } from '../../services/study/srs';
import { dbService } from '../../services/database/dbService';
import { isOnline, queueCardReview } from '../../services/offline/offlineStudyService';
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
  const update: Partial<Card> = {
    repetition: res.repetition,
    easeFactor: res.easeFactor,
    nextReview: Date.now() + res.interval * 86400000,
    lastReviewed: Date.now(),
  };
  if (res.fsrsState) update.fsrsState = res.fsrsState;

  if (!isOnline()) {
    try {
      await queueCardReview(card.id, rating, res);
    } catch {
      // non-blocking
    }
  }
  await dbService.updateCard(card.id, update);
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
    reviewedAt: Date.now(),
  }).catch(() => {});
  return { applied: true };
}

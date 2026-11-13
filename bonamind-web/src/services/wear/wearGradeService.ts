import type { Card } from '../../types';
import { calculateSRS } from '../../services/study/srs';
import { persistReview } from '../../services/study/persistReview';
import { cardReviewsService } from '../../services/database/modules/cardReviewsService';
import { wireRatingToAppRating, type GradeResult } from './wearPayload';

const appliedKeys = new Set<string>();
const inFlight = new Set<string>();
// Bound the dedupe set — keys are only needed while a watch session is in
// flight; old sessions' keys never matter again. Prevents unbounded growth
// during a very long app session.
const APPLIED_KEYS_MAX = 5000;

const appliedKey = (grade: GradeResult) => `${grade.sessionId}:${grade.cardId}`;

function rememberApplied(grade: GradeResult): void {
  if (appliedKeys.size >= APPLIED_KEYS_MAX) appliedKeys.clear();
  appliedKeys.add(appliedKey(grade));
}

/**
 * Why a grade was not applied:
 * - duplicate: already applied (the watch link can deliver a grade twice);
 * - unknown-card: not among the cards loaded; they may still be loading;
 * - not-saved: neither written nor queued, so it must be tried again.
 */
export type WatchGradeOutcome =
  | { applied: true }
  | { applied: false; reason: 'duplicate' | 'unknown-card' | 'not-saved' };

export async function applyWatchGrade(args: {
  grade: GradeResult;
  cards: Card[];
  userId: string;
  weights?: number[];
  targetRetention?: number;
}): Promise<WatchGradeOutcome> {
  const { grade, cards } = args;
  const key = appliedKey(grade);
  // A live delivery and a replay of the same grade can overlap.
  if (appliedKeys.has(key) || inFlight.has(key)) return { applied: false, reason: 'duplicate' };

  // Look the card up before remembering the grade: one that arrives before
  // the cards have loaded must still be applied when it is replayed.
  const card = cards.find((c) => c.id === grade.cardId);
  if (!card) return { applied: false, reason: 'unknown-card' };

  inFlight.add(key);
  try {
    return await applyToCard(grade, card, args);
  } finally {
    inFlight.delete(key);
  }
}

async function applyToCard(
  grade: GradeResult,
  card: Card,
  args: { userId: string; weights?: number[]; targetRetention?: number },
): Promise<WatchGradeOutcome> {
  const { userId } = args;

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

  const persisted = await persistReview({ cardId: card.id, rating, srsResult: res, update, userId, reviewedAt });
  if (!persisted.saved && !persisted.queued) return { applied: false, reason: 'not-saved' };
  rememberApplied(grade);
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

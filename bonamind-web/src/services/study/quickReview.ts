import { Card, Rating } from '../../types';
import { calculateSRS } from './srs';
import { cardReviewsService } from '../database/modules/cardReviewsService';
import { persistReview } from './persistReview';

/**
 * Grade one card outside a study session (spark pop-ups, the Study Float
 * window). Same path as StudyModePage: calculateSRS → dbService.updateCard →
 * cardReviewsService, so these are real reviews. Returns the card update so
 * the caller can apply it optimistically; throws only if the review could be
 * neither saved nor queued for sync.
 */
export async function reviewCard(
  card: Card,
  rating: Rating,
  userId: string | null | undefined,
  retention?: number,
): Promise<Partial<Card>> {
  const res = calculateSRS(card, rating, undefined, retention);
  const now = Date.now();
  const update: Partial<Card> = {
    interval: res.interval,
    repetition: res.repetition,
    easeFactor: res.easeFactor,
    nextReview: now + res.interval * 86_400_000,
    lastReviewed: now,
  };
  if (res.fsrsState) update.fsrsState = res.fsrsState;
  // Queued for sync when offline or when the write fails. Only a review
  // that was neither saved nor queued is a failure the caller sees.
  const { saved, queued } = await persistReview({
    cardId: card.id,
    rating,
    srsResult: res,
    update,
    userId,
    reviewedAt: now,
  });
  if (!saved && !queued) throw new Error(`Review of card ${card.id} was not saved`);
  if (userId) {
    cardReviewsService
      .recordReview({
        userId,
        cardId: card.id,
        rating,
        srsResult: {
          interval: res.interval,
          repetition: res.repetition,
          easeFactor: res.easeFactor,
          fsrsState: res.fsrsState,
        },
        reviewedAt: now,
      })
      .catch(() => { /* fire-and-forget, same as StudyModePage */ });
  }
  return update;
}

/**
 * Save one review's schedule so it survives a bad connection.
 *
 * Offline, the review is queued before the write is attempted. Online, a
 * write that fails anyway (timeout, 5xx, a dropped connection the browser has
 * not noticed yet) is queued after the fact and a sync is scheduled, because
 * no `online` event will come along to trigger one.
 *
 * `reviewedAt` must be the timestamp the caller used for `update.lastReviewed`
 * and sends to the review history: the queued copy replays with it, so the
 * history row is deduplicated and the guarded schedule write lines up.
 *
 * Every rating surface (study screen, Quick Review, sparks, Study Float, the
 * watch) goes through here so none of them can quietly lose a review.
 */
import type { Card } from '../../types';
import { dbService } from '../database/dbService';
import { isOnline, queueCardReview, scheduleOfflineSync } from '../offline/offlineStudyService';

export async function persistReview(input: {
  cardId: string;
  rating: number;
  srsResult: unknown;
  update: Partial<Card>;
  userId: string | null | undefined;
  reviewedAt: number;
}): Promise<{ saved: boolean; queued: boolean }> {
  const { cardId, rating, srsResult, update, userId, reviewedAt } = input;
  const queue = () => queueCardReview(cardId, rating, srsResult, { userId, reviewedAt });

  let queued = false;
  if (!isOnline()) {
    try {
      await queue();
      queued = true;
    } catch (err) {
      console.warn('[persistReview] Could not queue review for later sync:', err);
    }
  }

  try {
    await dbService.updateCard(cardId, update, { strict: true });
    return { saved: true, queued };
  } catch (writeErr) {
    if (!queued) {
      try {
        await queue();
        queued = true;
        scheduleOfflineSync();
      } catch (queueErr) {
        console.warn('[persistReview] Could not queue review for later sync:', queueErr);
      }
    }
    if (queued) console.warn('[persistReview] Card write failed; review queued for sync:', writeErr);
    return { saved: false, queued };
  }
}

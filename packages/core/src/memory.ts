import { calculateRetrievability, getFSRSState } from './scheduling/fsrs';
import type { Card } from './types';

export const SPARK_BAND_MIN = 0.65;
export const SPARK_BAND_MAX = 0.90;
export const RESURFACE_RATIO = 0.2;
export const MIN_QUEUE_SIZE = 6;
export const FIRST_GAP = 5;
export const GAP_GROWTH = 2;
export const MIN_REREVIEW_GAP_MS = 3 * 60 * 60 * 1000;

export function cardRetrievability(card: Card, now: number): number {
  if (!(card.lastReviewed && card.lastReviewed > 0)) return 0;
  const state = getFSRSState(card);
  const elapsedDays = state.lastReview > 0
    ? Math.max(0, (now - state.lastReview) / (24 * 60 * 60 * 1000))
    : 0;
  return calculateRetrievability({ ...state, elapsedDays });
}

export interface ComposeOptions {
  now: number;
  currentDeckId?: string;
  excludeDeckIds?: string[];
  rand?: () => number;
}

export function composeSessionQueue(
  dueCards: Card[],
  allCards: Card[],
  { now, currentDeckId, excludeDeckIds = [], rand = Math.random }: ComposeOptions,
): { queue: Card[]; resurfacedIds: Set<string> } {
  const random = typeof rand === 'function' ? rand : Math.random;

  const shuffled = <T,>(arr: T[]): T[] => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  const due = [...dueCards];
  if (due.length < MIN_QUEUE_SIZE) {
    return { queue: due, resurfacedIds: new Set() };
  }

  const excluded = new Set([...(currentDeckId ? [currentDeckId] : []), ...excludeDeckIds]);
  const dueIds = new Set(due.map((c) => c.id));

  const candidates = allCards.filter((c) => {
    if (excluded.has(c.deckId) || dueIds.has(c.id)) return false;
    if (!(c.lastReviewed && c.lastReviewed > 0)) return false;
    if (now - c.lastReviewed < MIN_REREVIEW_GAP_MS) return false;
    const r = cardRetrievability(c, now);
    return r >= SPARK_BAND_MIN && r <= SPARK_BAND_MAX;
  });

  const cap = Math.floor(due.length * RESURFACE_RATIO);
  if (cap <= 0 || candidates.length === 0) {
    return { queue: due, resurfacedIds: new Set() };
  }

  const weighted = shuffled(candidates)
    .map((c) => ({
      card: c,
      w: Math.pow(0.95 - cardRetrievability(c, now), 2) * (0.7 + 0.6 * random()),
    }))
    .sort((a, b) => b.w - a.w)
    .slice(0, cap)
    .map((x) => x.card);

  const resurfacedIds = new Set<string>();
  const queue: Card[] = [];
  let dueIdx = 0;
  const base = Math.max(2, Math.min(FIRST_GAP, Math.floor(due.length / (cap + 1)) - GAP_GROWTH));
  let nextGap = base;
  let resIdx = 0;

  while (dueIdx < due.length && resIdx < weighted.length) {
    const take = Math.min(nextGap, due.length - dueIdx);
    for (let i = 0; i < take; i++) queue.push(due[dueIdx++]);
    if (dueIdx < due.length) {
      const card = weighted[resIdx++];
      resurfacedIds.add(card.id);
      queue.push(card);
      nextGap += GAP_GROWTH;
    }
  }
  while (dueIdx < due.length) queue.push(due[dueIdx++]);

  return { queue, resurfacedIds };
}

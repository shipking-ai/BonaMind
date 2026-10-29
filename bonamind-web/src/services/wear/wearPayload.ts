import { WEAR_PAYLOAD_VERSION, WEAR_MAX_CARDS, WEAR_MAX_TEXT } from './wearProtocol';
import type { Card } from '../../types';
import { Rating } from '../../types';

export interface WearCard {
  cardId: string;
  deckId: string;
  front: string;
  back: string;
}

export interface ReviewPayload {
  version: number;
  sessionId: string;
  dueCount: number;
  reviewedToday: number;
  streak: number;
  cards: WearCard[];
}

export interface GradeResult {
  sessionId: string;
  cardId: string;
  rating: 0 | 1 | 2 | 3;
  timestamp: number;
}

const truncate = (s: string, max: number): string =>
  s.length <= max ? s : s.slice(0, max);

export function buildReviewPayload(opts: {
  cards: Card[];
  streak: number;
  reviewedToday: number;
  dueCount: number;
}): ReviewPayload {
  return {
    version: WEAR_PAYLOAD_VERSION,
    sessionId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    dueCount: opts.dueCount,
    reviewedToday: opts.reviewedToday,
    streak: opts.streak,
    cards: opts.cards.slice(0, WEAR_MAX_CARDS).map((c) => ({
      cardId: c.id,
      deckId: c.deckId,
      front: truncate(c.front, WEAR_MAX_TEXT),
      back: truncate(c.back, WEAR_MAX_TEXT),
    })),
  };
}

export function wireRatingToAppRating(r: 0 | 1 | 2 | 3): Rating {
  switch (r) {
    case 0: return Rating.AGAIN;
    case 1: return Rating.HARD;
    case 2: return Rating.GOOD;
    case 3: return Rating.EASY;
  }
}

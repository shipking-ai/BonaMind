import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LEGACY_PREFIX } from '../lib/legacyNames';

/**
 * A watch grade must survive the app being closed or still loading: the
 * phone keeps the grade on the watch link until the app acknowledges it,
 * and the app only acknowledges a grade it has applied (or never can).
 */

const persist = vi.hoisted(() => ({ result: { saved: true, queued: false } }));
const plugin = vi.hoisted(() => ({
  listeners: {} as Record<string, (g: unknown) => Promise<void> | void>,
  ackGrade: vi.fn(async (_: { uri: string }) => ({})),
  replayPendingGrades: vi.fn(async () => ({ count: 0 })),
  pushReviewPayload: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../lib/nativeShim', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    Plugins: {
      WearSync: {
        addListener: (name: string, fn: (g: unknown) => Promise<void>) => {
          plugin.listeners[name] = fn;
          return { remove: () => {} };
        },
        ackGrade: plugin.ackGrade,
        replayPendingGrades: plugin.replayPendingGrades,
        pushReviewPayload: plugin.pushReviewPayload,
      },
    },
  },
}));
vi.mock('../services/study/persistReview', () => ({
  persistReview: vi.fn(async () => persist.result),
}));
vi.mock('../services/database/modules/cardReviewsService', () => ({
  cardReviewsService: { recordReview: vi.fn(async () => {}) },
}));

import { initWearSync, replayWatchGrades } from '../services/wear/wearSyncManager';
import type { Card } from '../types';

const card = (id: string): Card =>
  ({ id, deckId: 'd1', front: 'q', back: 'a', repetition: 0, nextReview: 0, lastReviewed: 0 }) as Card;

let cards: Card[] = [];
let seq = 0;
const grade = (cardId: string) => ({
  sessionId: `s${++seq}`,
  cardId,
  rating: 2,
  timestamp: seq,
  uri: `wear://node/${LEGACY_PREFIX}/grade/${seq}/${cardId}`,
});
const deliver = (g: unknown) => plugin.listeners.onGradeResult(g);

initWearSync({
  getCards: () => cards,
  getStreak: async () => 0,
  getReviewedToday: () => 0,
  getDueCount: () => 0,
  getUserId: () => 'u1',
});

beforeEach(() => {
  cards = [card('c1')];
  persist.result = { saved: true, queued: false };
  vi.clearAllMocks();
});

describe('watch grade delivery', () => {
  it('acknowledges a grade once it is saved', async () => {
    const g = grade('c1');
    await deliver(g);
    expect(plugin.ackGrade).toHaveBeenCalledWith({ uri: g.uri });
  });

  it('keeps a grade that arrives before the cards load, and applies it on replay', async () => {
    cards = [];
    const g = grade('c1');
    await deliver(g);
    expect(plugin.ackGrade).not.toHaveBeenCalled();

    cards = [card('c1')];
    await deliver(g); // what replayPendingGrades re-emits
    expect(plugin.ackGrade).toHaveBeenCalledWith({ uri: g.uri });
  });

  it('keeps a grade that could be neither saved nor queued', async () => {
    persist.result = { saved: false, queued: false };
    const g = grade('c1');
    await deliver(g);
    expect(plugin.ackGrade).not.toHaveBeenCalled();

    persist.result = { saved: true, queued: false };
    await deliver(g);
    expect(plugin.ackGrade).toHaveBeenCalledWith({ uri: g.uri });
  });

  it('acknowledges a repeat delivery without applying it twice', async () => {
    const { persistReview } = await import('../services/study/persistReview');
    const g = grade('c1');
    await deliver(g);
    await deliver(g);
    expect(persistReview).toHaveBeenCalledTimes(1);
    expect(plugin.ackGrade).toHaveBeenCalledTimes(2);
  });

  it('applies overlapping deliveries of one grade once', async () => {
    const { persistReview } = await import('../services/study/persistReview');
    const g = grade('c1');
    await Promise.all([deliver(g), deliver(g)]);
    expect(persistReview).toHaveBeenCalledTimes(1);
  });

  it('drops a grade for a card that is not among the loaded cards', async () => {
    const g = grade('deleted-card');
    await deliver(g);
    expect(plugin.ackGrade).toHaveBeenCalledWith({ uri: g.uri });
  });

  it('asks the phone for waiting grades once cards are loaded', async () => {
    cards = [];
    await replayWatchGrades();
    expect(plugin.replayPendingGrades).not.toHaveBeenCalled();
    cards = [card('c1')];
    await replayWatchGrades();
    expect(plugin.replayPendingGrades).toHaveBeenCalledTimes(1);
  });
});

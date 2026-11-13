import { describe, it, expect } from 'vitest';
import {
  buildRevlog,
  fsrsRating,
  FSRS6_DEFAULTS,
  FSRS6_MIN_REVIEWS,
  isFsrs6Vector,
  resolveTimeZone,
  tuneFsrs6,
  type ReviewRow,
} from '../_lib/fsrsTraining.js';

const START = new Date('2026-09-16T00:00:00Z');
const DAY = 86_400_000;
const at = (base: string, days: number) => new Date(Date.parse(base) + days * DAY).toISOString();

describe('fsrsRating', () => {
  it('maps BonaMind ratings to FSRS grades', () => {
    expect([0, 1, 2, 3, 4, 5].map(fsrsRating)).toEqual([1, 1, 1, 2, 3, 4]);
  });

  it('rejects anything else', () => {
    expect(fsrsRating(6)).toBeNull();
    expect(fsrsRating(-1)).toBeNull();
    expect(fsrsRating(null)).toBeNull();
  });
});

describe('buildRevlog', () => {
  it('writes each card in time order, first review as learning', () => {
    const rows: ReviewRow[] = [
      { card_id: 'b', rating: 4, reviewed_at: at('2026-10-01T15:00:00Z', 2) },
      { card_id: 'a', rating: 4, reviewed_at: at('2026-10-01T15:00:00Z', 1) },
      { card_id: 'a', rating: 0, reviewed_at: at('2026-10-01T15:00:00Z', 0) },
      { card_id: 'b', rating: 5, reviewed_at: at('2026-10-01T15:00:00Z', 0) },
    ];
    const log = buildRevlog(rows, START);
    const t = (d: number) => Date.parse(at('2026-10-01T15:00:00Z', d));
    expect(log.csv.split('\n')).toEqual([
      'card_id,review_time,review_rating,review_state,review_duration',
      `1,${t(0)},4,1,0`,
      `1,${t(2)},3,2,0`,
      `2,${t(0)},1,1,0`,
      `2,${t(1)},3,2,0`,
    ]);
    expect(log).toMatchObject({ cards: 2, reviews: 4, skippedCards: 0 });
  });

  it('leaves out a card whose history started before per-review history existed', () => {
    const rows: ReviewRow[] = [
      { card_id: 'old', rating: 4, reviewed_at: '2026-09-10T12:00:00Z' },
      { card_id: 'old', rating: 4, reviewed_at: '2026-09-20T12:00:00Z' },
      { card_id: 'new', rating: 4, reviewed_at: '2026-09-20T12:00:00Z' },
    ];
    const log = buildRevlog(rows, START);
    expect(log).toMatchObject({ cards: 1, reviews: 1, skippedCards: 1 });
    expect(log.csv).not.toContain('2026-09-10');
  });

  it('skips unusable rows', () => {
    const rows: ReviewRow[] = [
      { card_id: 'a', rating: 9, reviewed_at: '2026-10-01T12:00:00Z' },
      { card_id: 'a', rating: 4, reviewed_at: 'not a date' },
      { card_id: '', rating: 4, reviewed_at: '2026-10-01T12:00:00Z' },
    ];
    expect(buildRevlog(rows, START)).toMatchObject({ cards: 0, reviews: 0 });
  });
});

describe('resolveTimeZone', () => {
  it('keeps a real IANA zone', () => {
    expect(resolveTimeZone('America/New_York')).toBe('America/New_York');
  });

  it('falls back to UTC', () => {
    expect(resolveTimeZone('Not/AZone')).toBe('UTC');
    expect(resolveTimeZone(42)).toBe('UTC');
    expect(resolveTimeZone('')).toBe('UTC');
  });
});

describe('isFsrs6Vector', () => {
  it('accepts exactly 21 finite numbers', () => {
    expect(isFsrs6Vector([...FSRS6_DEFAULTS])).toBe(true);
    expect(isFsrs6Vector(FSRS6_DEFAULTS.slice(0, 20))).toBe(false);
    expect(isFsrs6Vector([...FSRS6_DEFAULTS.slice(0, 20), Number.NaN])).toBe(false);
    expect(isFsrs6Vector('nope')).toBe(false);
  });
});

/**
 * A learner who forgets faster than the defaults assume: recall follows a
 * power curve on a stability that grows more slowly than FSRS's defaults.
 * Seeded, so every run produces the same history.
 */
function simulatedHistory(cardCount: number): ReviewRow[] {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const t0 = Date.parse('2026-09-20T14:00:00Z');
  const rows: ReviewRow[] = [];
  for (let c = 0; c < cardCount; c++) {
    let t = t0 + Math.floor(rnd() * 20) * DAY;
    let stability = 1.2;
    let interval = 1;
    for (let k = 0; k < 10 && t < t0 + 120 * DAY; k++) {
      const first = k === 0;
      const recalled = first || rnd() < Math.pow(1 + interval / (9 * stability), -1);
      const grade = first ? (rnd() < 0.3 ? 1 : 3) : recalled ? (rnd() < 0.15 ? 2 : rnd() < 0.1 ? 4 : 3) : 1;
      const rating = [0, 0, 3, 4, 5][grade];
      rows.push({ card_id: `card-${c}`, rating, reviewed_at: new Date(t).toISOString() });
      stability = grade === 1 ? Math.max(0.5, stability * 0.4) : stability * (grade === 2 ? 1.6 : grade === 4 ? 3.5 : 2.4);
      interval = Math.max(1, Math.round(stability * (0.8 + rnd() * 0.6)));
      t += interval * DAY;
    }
  }
  return rows;
}

describe('tuneFsrs6', () => {
  it('does not load the optimizer when there are too few reviews', async () => {
    const result = await tuneFsrs6(simulatedHistory(5), { historyStart: START, timeZone: 'UTC' }, () => {
      throw new Error('optimizer loaded');
    });
    expect(result).toMatchObject({ status: 'not-enough-data', needed: FSRS6_MIN_REVIEWS });
  });

  // The optimizer is a native module that needs Node 24 (production runs
  // 24.x); CI also runs this suite on 22, where these two are skipped.
  const node24 = Number(process.versions.node.split('.')[0]) >= 24;

  it.skipIf(!node24)('fits 21 FSRS-6 parameters that beat the defaults on this history', async () => {
    const result = await tuneFsrs6(simulatedHistory(150), { historyStart: START, timeZone: 'America/New_York' });
    expect(result.status).toBe('tuned');
    if (result.status !== 'tuned') return;
    expect(isFsrs6Vector(result.parameters)).toBe(true);
    expect(result.reviews).toBeGreaterThanOrEqual(FSRS6_MIN_REVIEWS);
    expect(result.logLoss).toBeLessThan(result.defaultLogLoss);
  }, 60_000);

  it.skipIf(!node24)('counts usable reviews, not rows, against the minimum', async () => {
    // Enough rows, but every card is reviewed only once: nothing to learn from.
    const rows: ReviewRow[] = Array.from({ length: FSRS6_MIN_REVIEWS + 50 }, (_, i) => ({
      card_id: `once-${i}`,
      rating: 4,
      reviewed_at: '2026-10-01T12:00:00Z',
    }));
    const result = await tuneFsrs6(rows, { historyStart: START, timeZone: 'UTC' });
    expect(result).toEqual({ status: 'not-enough-data', reviews: 0, needed: FSRS6_MIN_REVIEWS });
  }, 60_000);
});

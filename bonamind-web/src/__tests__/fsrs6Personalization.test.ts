import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Personal FSRS-6 tuning, app side: loadPersonalizedFsrs uses a saved
 * FSRS-6 fit, asks the server for a new one when there is none (or it is
 * old), and the scheduler then actually schedules with it.
 */

const db = vi.hoisted(() => ({
  row: null as null | Record<string, unknown>,
  rpc: vi.fn(async (..._args: unknown[]) => ({ error: null })),
  token: 'session-token' as string | null,
}));

vi.mock('../services/database/supabase', () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: db.row, error: null }) }),
      }),
    }),
    rpc: db.rpc,
    auth: {
      getSession: async () => ({ data: { session: db.token ? { access_token: db.token } : null } }),
    },
  };
  return { supabase, requireSupabase: () => supabase };
});

import { loadPersonalizedFsrs, type UserStats } from '../services/study/fsrsAdaptation';
import {
  FSRS6_MIN_REVIEWS,
  FSRS6_RETRY_MS,
  requestFsrs6Tune,
  type Fsrs6TuneResult,
} from '../services/study/fsrs6Tuning';
import { FSRS_PARAMETERS, DEFAULT_WEIGHTS } from '../services/study/fsrs';
import { calculateSRS } from '../services/study/srs';
import { Rating, type Card } from '../types';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-13T12:00:00Z');

/** A plausible fit for someone who forgets fast: lower initial stabilities. */
const FITTED = FSRS_PARAMETERS.map((w, i) => (i < 4 ? w * 0.5 : w));

const stats = (reviewCount: number): UserStats => ({
  avgStability: 5,
  lapseRatePer100: 10,
  retention: 0.85,
  reviewCount,
});

const tuned: Fsrs6TuneResult = {
  status: 'tuned',
  parameters: FITTED,
  reviews: 820,
  logLoss: 0.30,
  defaultLogLoss: 0.32,
};

beforeEach(() => {
  db.row = null;
  db.rpc.mockClear();
  db.token = 'session-token';
  localStorage.clear();
});

describe('loadPersonalizedFsrs with FSRS-6 fits', () => {
  it('uses a recent saved fit without asking the server', async () => {
    db.row = { weights: FITTED, last_tuned_at: new Date(NOW - 2 * DAY).toISOString(), review_count: 820, profile_label: null };
    const tune = vi.fn();
    const result = await loadPersonalizedFsrs('u1', stats(900), [], { tune, now: NOW });
    expect(result).toMatchObject({ weights: FITTED, personalized: true });
    expect(tune).not.toHaveBeenCalled();
  });

  it('fits and saves when there is no saved fit', async () => {
    const tune = vi.fn(async () => tuned);
    const result = await loadPersonalizedFsrs('u1', stats(900), [], { tune, now: NOW });
    expect(result).toMatchObject({ weights: FITTED, personalized: true });
    expect(db.rpc).toHaveBeenCalledWith('upsert_user_fsrs_params', expect.objectContaining({
      p_user_id: 'u1',
      p_weights: JSON.stringify(FITTED),
      p_review_count: 820,
      p_loss_value: 0.30,
    }));
  });

  it('does not ask the server below the review minimum', async () => {
    const tune = vi.fn(async () => tuned);
    const result = await loadPersonalizedFsrs('u1', stats(FSRS6_MIN_REVIEWS - 1), [], { tune, now: NOW });
    expect(tune).not.toHaveBeenCalled();
    expect(result.personalized).toBe(false);
  });

  it('asks at most once a day, unless forced', async () => {
    const tune = vi.fn(async (): Promise<Fsrs6TuneResult> => ({ status: 'not-enough-data', reviews: 120, needed: 400 }));
    await loadPersonalizedFsrs('u1', stats(900), [], { tune, now: NOW });
    await loadPersonalizedFsrs('u1', stats(900), [], { tune, now: NOW + DAY / 2 });
    expect(tune).toHaveBeenCalledTimes(1);
    await loadPersonalizedFsrs('u1', stats(900), [], { tune, now: NOW + DAY / 2, force: true });
    expect(tune).toHaveBeenCalledTimes(2);
    await loadPersonalizedFsrs('u1', stats(900), [], { tune, now: NOW + DAY / 2 + FSRS6_RETRY_MS });
    expect(tune).toHaveBeenCalledTimes(3);
  });

  it('keeps an old fit when a refit does not beat it', async () => {
    db.row = { weights: FITTED, last_tuned_at: new Date(NOW - 60 * DAY).toISOString(), review_count: 820, profile_label: null };
    const tune = vi.fn(async (): Promise<Fsrs6TuneResult> => ({ status: 'no-improvement', reviews: 900, logLoss: 0.33, defaultLogLoss: 0.32 }));
    const result = await loadPersonalizedFsrs('u1', stats(900), [], { tune, now: NOW });
    expect(tune).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ weights: FITTED, personalized: true });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('ignores a saved vector from the retired 20-number tuner', async () => {
    db.row = { weights: DEFAULT_WEIGHTS, last_tuned_at: new Date(NOW - DAY).toISOString(), review_count: 100, profile_label: 'moderate' };
    const tune = vi.fn(async (): Promise<Fsrs6TuneResult> => ({ status: 'not-enough-data', reviews: 120, needed: 400 }));
    const result = await loadPersonalizedFsrs('u1', stats(900), [], { tune, now: NOW });
    expect(tune).toHaveBeenCalledTimes(1);
    expect(result.personalized).toBe(false);
  });
});

describe('a fitted FSRS-6 vector reaches the schedule', () => {
  const card = { id: 'c', deckId: 'd', front: 'Q', back: 'A', repetition: 0 } as Card;

  it('changes the memory state a new card starts with', () => {
    const withDefaults = calculateSRS(card, Rating.GOOD, FSRS_PARAMETERS.slice(), 0.9);
    const withFit = calculateSRS(card, Rating.GOOD, FITTED, 0.9);
    expect(withFit.fsrsState?.stability).toBeCloseTo(FITTED[2], 4);
    expect(withDefaults.fsrsState?.stability).toBeCloseTo(FSRS_PARAMETERS[2], 4);
  });

  it('changes the interval for someone who remembers longer', () => {
    const remembersLonger = FSRS_PARAMETERS.map((w, i) => (i < 4 ? w * 4 : w));
    const withDefaults = calculateSRS(card, Rating.GOOD, FSRS_PARAMETERS.slice(), 0.9);
    const withFit = calculateSRS(card, Rating.GOOD, remembersLonger, 0.9);
    expect(withFit.interval).toBeGreaterThan(withDefaults.interval);
  });

  it('ignores a vector that is not FSRS-6', () => {
    const withDefaults = calculateSRS(card, Rating.GOOD, FSRS_PARAMETERS.slice(), 0.9);
    const withLegacy = calculateSRS(card, Rating.GOOD, DEFAULT_WEIGHTS.map((w) => w * 4), 0.9);
    expect(withLegacy.interval).toBe(withDefaults.interval);
  });
});

describe('requestFsrs6Tune', () => {
  it('posts the time zone with the session token and returns the fit', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(tuned), { status: 200 }));
    const result = await requestFsrs6Tune(fetchImpl as unknown as typeof fetch);
    expect(result).toEqual(tuned);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/fsrs\/tune$/);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-token');
    expect(JSON.parse(String(init.body))).toHaveProperty('timeZone');
  });

  it('returns null when signed out, on an error status, or on a malformed fit', async () => {
    const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    expect(await requestFsrs6Tune(ok({ ...tuned, parameters: [1, 2, 3] }) as unknown as typeof fetch)).toBeNull();
    expect(await requestFsrs6Tune(vi.fn(async () => new Response('{}', { status: 503 })) as unknown as typeof fetch)).toBeNull();
    db.token = null;
    const fetchImpl = ok(tuned);
    expect(await requestFsrs6Tune(fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

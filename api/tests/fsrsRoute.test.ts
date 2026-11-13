import { describe, it, expect, vi, beforeEach } from 'vitest';
import { call } from './helpers.js';

/**
 * /api/fsrs/tune — fits personal FSRS-6 parameters to the caller's own
 * review history. It must require a signed-in user, read only that user's
 * card_reviews, and never write anything (the app stores the result).
 * The fitting itself is covered in fsrsTraining.test.ts.
 */

const state = vi.hoisted(() => ({
  reviews: [] as Array<{ card_id: string; rating: number; reviewed_at: string }>,
  appliedAt: '2026-09-20T10:00:00Z' as string | null,
  calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
}));

const supabase = vi.hoisted(() => {
  const builder = (table: string) => {
    const b: any = {};
    for (const op of ['select', 'eq', 'order', 'gte', 'lt', 'in']) {
      b[op] = vi.fn((...args: unknown[]) => {
        state.calls.push({ table, op, args });
        return b;
      });
    }
    for (const op of ['insert', 'update', 'upsert', 'delete', 'rpc']) {
      b[op] = vi.fn(() => {
        throw new Error(`fsrs/tune must not ${op} ${table}`);
      });
    }
    b.maybeSingle = vi.fn(async () => ({ data: state.appliedAt ? { applied_at: state.appliedAt } : null, error: null }));
    b.range = vi.fn(async (from: number, to: number) => ({
      data: state.reviews.slice(from, to + 1),
      error: null,
    }));
    return b;
  };
  return {
    auth: { getUser: vi.fn() },
    from: vi.fn((table: string) => builder(table)),
    rpc: vi.fn(() => {
      throw new Error('fsrs/tune must not call an RPC');
    }),
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => supabase) }));

const AUTHED = { headers: { authorization: 'Bearer token' } };

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  state.reviews = [];
  state.appliedAt = '2026-09-20T10:00:00Z';
  state.calls = [];
  supabase.auth.getUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'u@x.co', app_metadata: {} } },
    error: null,
  });
});

describe('/api/fsrs/tune', () => {
  it('needs a signed-in user', async () => {
    const res = await call('fsrs/tune', { body: {} });
    expect(res.status).toBe(401);
  });

  it('only accepts POST', async () => {
    const res = await call('fsrs/tune', { method: 'GET', ...AUTHED });
    expect(res.status).toBe(405);
  });

  it('rejects unknown actions', async () => {
    const res = await call('fsrs/other', { body: {}, ...AUTHED });
    expect(res.status).toBe(404);
  });

  it('rejects a malformed time zone', async () => {
    const res = await call('fsrs/tune', { body: { timeZone: 'x'.repeat(100) }, ...AUTHED });
    expect(res.status).toBe(400);
  });

  it("reads only the caller's reviews and reports when there are too few", async () => {
    state.reviews = [
      { card_id: 'c1', rating: 4, reviewed_at: '2026-10-01T12:00:00Z' },
      { card_id: 'c1', rating: 4, reviewed_at: '2026-10-03T12:00:00Z' },
    ];
    const res = await call('fsrs/tune', { body: { timeZone: 'America/New_York' }, ...AUTHED });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'not-enough-data', reviews: 2, needed: 400 });

    const reviewFilters = state.calls.filter((c) => c.table === 'card_reviews' && c.op === 'eq');
    expect(reviewFilters).toEqual([{ table: 'card_reviews', op: 'eq', args: ['user_id', 'user-1'] }]);
  });

  it('reads the history start from the migration ledger', async () => {
    const res = await call('fsrs/tune', { body: {}, ...AUTHED });
    expect(res.status).toBe(200);
    expect(state.calls).toContainEqual({
      table: 'schema_migrations',
      op: 'eq',
      args: ['version', '20260916000000_card_reviews_history'],
    });
  });

  it('pages through long histories', async () => {
    state.reviews = Array.from({ length: 2500 }, (_, i) => ({
      card_id: `c${i}`,
      rating: 4,
      reviewed_at: new Date(Date.parse('2026-10-01T00:00:00Z') + i * 60_000).toISOString(),
    }));
    const res = await call('fsrs/tune', { body: {}, ...AUTHED });
    expect(res.status).toBe(200);
    // 2,500 single reviews: every card seen once, so nothing to train on.
    expect(res.body.status).toBe('not-enough-data');
    const ranges = supabase.from.mock.results
      .map((r: any) => r.value)
      .filter((b: any) => b.range.mock.calls.length)
      .flatMap((b: any) => b.range.mock.calls);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
});

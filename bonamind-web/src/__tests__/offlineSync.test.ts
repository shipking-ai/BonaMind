import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A minimal Supabase stand-in: records every RPC and guarded card update.
const calls = vi.hoisted(() => ({
  rpc: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ id: string; payload: Record<string, unknown>; guard: string }>,
  rpcError: null as null | { code: string; message: string },
  session: { user: { id: 'u1' } } as null | { user: { id: string } },
}));

vi.mock('../services/database/supabase', () => {
  const client = {
    auth: { getSession: async () => ({ data: { session: calls.session } }) },
    rpc: async (_name: string, args: Record<string, unknown>) => {
      calls.rpc.push(args);
      return { error: calls.rpcError };
    },
    from: (_table: string) => ({
      update: (payload: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => ({
          or: async (guard: string) => {
            calls.updates.push({ id, payload, guard });
            return { error: null };
          },
        }),
      }),
    }),
  };
  return { supabase: client, requireSupabase: () => client };
});

const DAY = 86_400_000;
const srs = (interval: number) => ({ interval, repetition: 2, easeFactor: 2.5, fsrsState: { stability: interval, difficulty: 5 } });

async function freshService() {
  // A new IndexedDB and a new module instance per test, so the service's
  // cached database handle never leaks between tests.
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  vi.resetModules();
  return import('../services/offline/offlineStudyService');
}

beforeEach(() => {
  calls.rpc = [];
  calls.updates = [];
  calls.rpcError = null;
  calls.session = { user: { id: 'u1' } };
});

describe('syncOfflineData', () => {
  it('writes the queued schedule to the card, not just the review history', async () => {
    const svc = await freshService();
    const at = 1_800_000_000_000;
    await svc.queueCardReview('c1', 4, srs(3), { userId: 'u1', reviewedAt: at });

    const result = await svc.syncOfflineData();

    expect(result).toEqual({ synced: 1, failed: 0, dropped: 0 });
    expect(calls.rpc[0]).toMatchObject({ p_card_id: 'c1', p_rating: 4, p_reviewed_at: new Date(at).toISOString() });
    expect(calls.updates).toHaveLength(1);
    const { id, payload, guard } = calls.updates[0];
    expect(id).toBe('c1');
    expect(payload).toMatchObject({
      interval: 3,
      repetition: 2,
      ease_factor: 2.5,
      next_review: new Date(at + 3 * DAY).toISOString(),
      last_reviewed: new Date(at).toISOString(),
    });
    expect(payload.fsrs_state).toBeDefined();
    // Never overwrite a newer review that reached the server first.
    expect(guard).toBe(`last_reviewed.is.null,last_reviewed.lt.${new Date(at).toISOString()}`);
    expect(await svc.getPendingSyncItems()).toHaveLength(0);
  });

  it('replays reviews oldest first so the latest schedule wins', async () => {
    const svc = await freshService();
    await svc.queueCardReview('c1', 4, srs(10), { userId: 'u1', reviewedAt: 2_000 });
    await svc.queueCardReview('c1', 0, srs(1), { userId: 'u1', reviewedAt: 1_000 });

    await svc.syncOfflineData();

    expect(calls.updates.map((u) => u.payload.interval)).toEqual([1, 10]);
  });

  it('does nothing without a signed-in session, keeping the queue', async () => {
    const svc = await freshService();
    await svc.queueCardReview('c1', 4, srs(3), { userId: 'u1', reviewedAt: 1_000 });
    calls.session = null;

    const result = await svc.syncOfflineData();

    expect(result).toEqual({ synced: 0, failed: 0, dropped: 0 });
    expect(calls.rpc).toHaveLength(0);
    expect(await svc.getPendingSyncItems()).toHaveLength(1);
  });

  it("leaves another account's queued reviews for that account", async () => {
    const svc = await freshService();
    await svc.queueCardReview('c1', 4, srs(3), { userId: 'someone-else', reviewedAt: 1_000 });

    await svc.syncOfflineData();

    expect(calls.rpc).toHaveLength(0);
    expect(await svc.getPendingSyncItems()).toHaveLength(1);
  });

  it('drops a review the server will never accept instead of retrying forever', async () => {
    const svc = await freshService();
    await svc.queueCardReview('gone', 4, srs(3), { userId: 'u1', reviewedAt: 1_000 });
    calls.rpcError = { code: 'P0002', message: 'card not found' };

    const result = await svc.syncOfflineData();

    expect(result).toEqual({ synced: 0, failed: 0, dropped: 1 });
    expect(await svc.getPendingSyncItems()).toHaveLength(0);
  });

  it('keeps a review after a transient failure and counts the retry', async () => {
    const svc = await freshService();
    await svc.queueCardReview('c1', 4, srs(3), { userId: 'u1', reviewedAt: 1_000 });
    calls.rpcError = { code: '57014', message: 'statement timeout' };

    const result = await svc.syncOfflineData();

    expect(result).toEqual({ synced: 0, failed: 1, dropped: 0 });
    const [item] = await svc.getPendingSyncItems();
    expect(item.retryCount).toBe(1);
    expect(calls.updates).toHaveLength(0);
  });
});

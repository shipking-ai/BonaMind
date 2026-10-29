import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  selectColumns: '' as string,
  rows: [] as Array<Record<string, unknown>>,
  selectError: null as null | { message: string },
  upserts: [] as Array<Array<Record<string, unknown>>>,
  deletes: [] as string[],
}));

vi.mock('../services/database/supabase', () => {
  const query = {
    eq: () => query,
    order: () => query,
    limit: async () => ({ data: db.rows, error: db.selectError }),
  };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: () => ({
        select: (cols: string) => {
          db.selectColumns = cols;
          return query;
        },
        upsert: async (rows: Array<Record<string, unknown>>) => {
          db.upserts.push(rows);
          return { error: null };
        },
        delete: () => ({
          eq: (_col: string, id: string) => ({
            eq: async () => {
              db.deletes.push(id);
              return { error: null };
            },
          }),
        }),
      }),
    },
  };
});

import {
  canonicalSessionId,
  deleteRemoteSession,
  fetchRemoteSessions,
  flush,
  mergeRemoteSessions,
  queueSession,
  type PersistedSession,
} from '../services/chatSessionService';

const session = (id: string, updatedAt: number, title = 'Photosynthesis'): PersistedSession => ({
  id,
  title,
  pinned: false,
  preview: '',
  messages: [{ id: 'm1', role: 'user', content: title } as never],
  createdAt: 1,
  updatedAt,
});

beforeEach(() => {
  db.selectColumns = '';
  db.rows = [];
  db.selectError = null;
  db.upserts = [];
  db.deletes = [];
});

describe('fetchRemoteSessions', () => {
  it('selects only columns that exist on ai_chat_sessions', async () => {
    await fetchRemoteSessions();
    // camelCase names made PostgREST reject the query, so nothing ever loaded.
    expect(db.selectColumns).not.toMatch(/createdAt|updatedAt/);
    expect(db.selectColumns).toContain('updated_at');
  });

  it('maps rows and throws when the query fails', async () => {
    db.rows = [{ id: 'r1', title: 'T', pinned: true, messages: [], created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z' }];
    const [r] = await fetchRemoteSessions();
    expect(r).toMatchObject({ id: 'r1', title: 'T', pinned: true, updatedAt: Date.parse('2026-10-02T00:00:00Z') });

    db.selectError = { message: 'boom' };
    await expect(fetchRemoteSessions()).rejects.toEqual({ message: 'boom' });
  });
});

describe('mergeRemoteSessions', () => {
  const identity = (r: PersistedSession) => r;

  it('adds remote-only sessions and keeps local-only ones', () => {
    const merged = mergeRemoteSessions([session('sess-1-a', 5)], [session('remote-uuid', 3)], identity);
    expect(merged.map((s) => s.id)).toEqual(['sess-1-a', 'remote-uuid']);
  });

  it('matches a local slug to its remote UUID and keeps the newer copy under the local id', () => {
    const local = session('sess-1-a', 5, 'old title');
    const remote = session(canonicalSessionId('sess-1-a'), 9, 'renamed on phone');
    const [merged] = mergeRemoteSessions([local], [remote], identity);
    expect(merged.id).toBe('sess-1-a');
    expect(merged.title).toBe('renamed on phone');
  });

  it('keeps the local copy when it is newer', () => {
    const local = session('sess-1-a', 9, 'typed offline');
    const remote = session(canonicalSessionId('sess-1-a'), 5, 'stale');
    expect(mergeRemoteSessions([local], [remote], identity)[0].title).toBe('typed offline');
  });
});

describe('queueSession / deleteRemoteSession', () => {
  it('upserts each session once per flush, with its latest content', async () => {
    void queueSession(session('sess-1-a', 1, 'first'));
    void queueSession(session('sess-1-a', 2, 'second'));
    await flush();
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]).toHaveLength(1);
    expect(db.upserts[0][0]).toMatchObject({ id: canonicalSessionId('sess-1-a'), title: 'second' });
  });

  it('cancels a queued save of a deleted session and deletes by remote id', async () => {
    void queueSession(session('sess-2-b', 1));
    await deleteRemoteSession('sess-2-b');
    await flush();
    expect(db.upserts).toHaveLength(0);
    expect(db.deletes).toEqual([canonicalSessionId('sess-2-b')]);
  });
});

/**
 * Guards the "Save chat history" opt-out against leaving server copies
 * behind (#216). While saving is on, #202 syncs chats to `ai_chat_sessions`;
 * switching the setting off used to clear local copies only. Now the toggle
 * asks "Also delete your saved chats from your account?" and the yes path
 * sweeps the remote table via the new bulk helper.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  /** Each entry is one page returned per fetch, in order; last one repeats. */
  pages: [] as Array<Array<Record<string, unknown>>>,
  deletes: [] as Array<string>,
  deleteErrorFor: '' as string,
}));

vi.mock('../services/database/supabase', () => {
  const makeQuery = () => {
    const query = {
      eq: () => query,
      order: () => query,
      limit: async () => {
        const page = db.pages.shift() ?? [];
        return { data: page, error: null };
      },
    };
    return query;
  };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: () => ({
        select: () => makeQuery(),
        delete: () => ({
          eq: (_col: string, id: string) => ({
            eq: async () => {
              if (id === db.deleteErrorFor) return { error: { message: 'row locked' } };
              db.deletes.push(id);
              return { error: null };
            },
          }),
        }),
      }),
    },
  };
});

import { deleteAllRemoteSessions } from '../services/chatSessionService';

/** UUID ids so `deleteRemoteSession`'s canonicalization is a pass-through. */
const row = (id: string, updatedAt = 1) => ({
  id,
  title: 't',
  mode: undefined,
  deck_id: null,
  deck_name: undefined,
  pinned: false,
  messages: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: new Date(updatedAt).toISOString(),
});

beforeEach(() => {
  db.pages = [];
  db.deletes = [];
  db.deleteErrorFor = '';
});

describe('deleteAllRemoteSessions', () => {
  const uuid = (n: number) => `a1b2c3d4-e5f6-4a7b-8c9d-${String(n).padStart(12, '0')}`;

  it('sweeps a full 50-row page and keeps going until a short page', async () => {
    db.pages = [
      Array.from({ length: 50 }, (_, i) => row(uuid(i), i + 1)),
      Array.from({ length: 20 }, (_, i) => row(uuid(100 + i), i + 100)),
      [],
    ];

    const deleted = await deleteAllRemoteSessions();

    expect(db.deletes).toHaveLength(70);
    expect(deleted).toBe(70);
    expect(db.pages).toHaveLength(1); // only the trailing empty page is left
  });

  it('a failing row neither stops the sweep nor counts as deleted', async () => {
    db.pages = [
      Array.from({ length: 3 }, (_, i) => row(uuid(i), i + 1)),
      [],
    ];
    db.deleteErrorFor = uuid(1);

    const deleted = await deleteAllRemoteSessions();

    expect(db.deletes).toHaveLength(2);
    expect(db.deletes).not.toContain('r-1');
    expect(deleted).toBe(2);
  });

  it('deleting nothing is a clean 0', async () => {
    db.pages = [[]];
    expect(await deleteAllRemoteSessions()).toBe(0);
    expect(db.deletes).toHaveLength(0);
  });
});

describe('the opt-out wiring', () => {
  const REPO = path.resolve(__dirname, '../..');

  it('both settings screens ask the exact question on switch-off', () => {
    const question = 'Also delete your saved chats from your account?';
    for (const file of ['src/pages/settings/SettingsPage.tsx', 'src/components/native/AndroidSettingsScreen.tsx']) {
      const src = readFileSync(path.join(REPO, file), 'utf8');
      expect(src, `${file} must ask about deleting remote copies`).toContain(question);
      expect(src, `${file} must sweep the remote table on the yes path`).toContain('deleteAllRemoteSessions');
    }
  });

  it('the toggle handlers only fire the wipe when turning off', () => {
    for (const file of ['src/pages/settings/SettingsPage.tsx', 'src/components/native/AndroidSettingsScreen.tsx']) {
      const src = readFileSync(path.join(REPO, file), 'utf8');
      expect(src).toMatch(/wasOn && !next && window\.confirm/);
    }
  });
});

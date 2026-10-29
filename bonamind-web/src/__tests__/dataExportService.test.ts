/**
 * Guards the honest-data-export contract.
 *
 * Real regressions these catch: "Export your data" downloaded only this
 * browser's localStorage, "Export Anki package" wrote a header for zero
 * cards, and "Reset progress" warned about wiping everything while only
 * clearing local keys. Also pins the paged fetch, so a 1000-row PostgREST
 * request cap cannot silently truncate a heavy user's export again.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ankiTsv, buildDataExport, fetchAllRows } from '../services/data/dataExportService';

type Row = Record<string, unknown>;

interface Call {
  table: string;
  range?: [number, number];
}

/**
 * A minimal PostgREST-shaped client: from().select().eq().range() chains plus
 * maybeSingle(), backed by per-table row stores, recording every call.
 */
function makeClient(tables: Record<string, Row[]>) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table };
      calls.push(call);
      const chain = (r?: [number, number]) => {
        if (r) call.range = r;
        return {
          select: () => chain(r),
          eq: () => chain(r),
          range: (from: number, to: number) => chain([from, to]),
          maybeSingle: async () => ({ data: tables[table]?.[0] ?? null, error: null }),
          then(onOk: (r: { data: unknown[] | null; error: null }) => unknown) {
            const [from, to] = call.range ?? [0, Number.POSITIVE_INFINITY];
            return Promise.resolve(
              onOk({ data: (tables[table] ?? []).slice(from, to + 1), error: null }),
            );
          },
        };
      };
      return { select: () => chain() };
    },
  };
  return { client, calls };
}

describe('buildDataExport', () => {
  it('gathers profile, decks, cards, reviews, sessions and local prefs', async () => {
    const { client, calls } = makeClient({
      user_profiles: [{ user_id: 'u1', name: 'Ada' }],
      decks: [{ id: 'd1', user_id: 'u1', title: 'Biology' }],
      cards: [{ id: 'c1', user_id: 'u1', deck_id: 'd1', front: 'Q', back: 'A' }],
      card_reviews: [{ id: 'r1', user_id: 'u1' }],
      study_sessions: [{ id: 's1', user_id: 'u1' }],
    });

    const bundle = await buildDataExport('u1', { bonamind_dailyGoal: '10' }, client);

    expect(bundle.profile).toEqual({ user_id: 'u1', name: 'Ada' });
    expect((bundle.decks as Row[])[0].id).toBe('d1');
    expect((bundle.cards as Row[])[0].front).toBe('Q');
    expect(bundle.cardReviews).toHaveLength(1);
    expect(bundle.studySessions).toHaveLength(1);
    expect(bundle.localPreferences).toEqual({ bonamind_dailyGoal: '10' });
    expect(typeof bundle.exportedAt).toBe('string');
    expect(Number.isNaN(new Date(bundle.exportedAt).getTime())).toBe(false);

    const tablesHit = new Set(calls.map((c) => c.table));
    expect(tablesHit).toEqual(
      new Set(['user_profiles', 'decks', 'cards', 'card_reviews', 'study_sessions']),
    );
  });

  it('pages large tables instead of silently dropping rows past 1000', async () => {
    const bigTable = Array.from({ length: 1250 }, (_, i) => ({ id: `c${i}` }));
    const { client, calls } = makeClient({
      user_profiles: [{ user_id: 'u1' }],
      decks: [],
      cards: bigTable,
      card_reviews: [],
      study_sessions: [],
    });

    const bundle = await buildDataExport('u1', {}, client);

    expect(bundle.cards).toHaveLength(1250);
    const cardPages = calls.filter((c) => c.table === 'cards' && c.range);
    expect(cardPages.map((c) => c.range![0])).toEqual([0, 1000]);
  });

  it('fetchAllRows pages each 1000-row window, never dropping a row', async () => {
    const bigTable = Array.from({ length: 2400 }, (_, i) => ({ id: `c${i}` }));
    const { client } = makeClient({ cards: bigTable });
    const rows = (await fetchAllRows(client, 'cards', 'u1')) as Row[];
    expect(rows).toHaveLength(2400);
    expect(rows.map((r) => r.id)).toEqual(bigTable.map((r) => r.id));
  });
});

describe('ankiTsv', () => {
  it('writes every card as front<TAB>back and keeps row format intact', () => {
    const tsv = ankiTsv([
      { front: 'Mitochondria make…', back: 'ATP' },
      { front: ' moltosis ', back: 'mitosis with a\tTab' },
    ]);
    const lines = tsv.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('Mitochondria make…\tATP');
    expect(lines[1]).toBe('moltosis\tmitosis with a Tab');
  });
});

describe('the settings screens honestly name what they do', () => {
  const read = (rel: string): string => readFileSync(path.join(__dirname, '../..', rel), 'utf8');

  it('the web settings page never promises an anki package', () => {
    const page = read('src/pages/settings/SettingsPage.tsx');
    expect(page).not.toMatch(/Export Anki package/);
    expect(page).not.toMatch(/Anki package exported/);
    expect(page).toMatch(/Export cards for Anki \(TSV\)/);
  });

  it('the reset wording is scoped to this device', () => {
    const page = read('src/pages/settings/SettingsPage.tsx');
    expect(page).not.toMatch(/reset all your study progress/i);
    expect(page).not.toMatch(/will reset all/i);
    expect(page).toMatch(/this device/i);
  });

  it('the android settings screen exports through the shared builder', () => {
    const page = read('src/components/native/AndroidSettingsScreen.tsx');
    expect(page).toMatch(/buildDataExport/);
    expect(page).not.toMatch(/bonamind-settings-/);
    expect(page).not.toMatch(/Settings exported/);
  });
});

/**
 * Guards the paged read path and the deck-count aggregation.
 *
 * A real regression shipped: PostgREST caps requests at 1000 rows, so the
 * unpaged cards read silently dropped everything past 1,000, and deck
 * counts loaded one row per card (also capped, and with a URL-long .in()
 * list). With paged reads, a 2,500-card library must come back complete.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fetchAllPages, type RowQuery, type RowsClient } from '../services/database/pagedFetch';

type Row = Record<string, unknown>;

interface Call {
  table: string;
  range?: [number, number];
  in?: [string, unknown[]];
  ordered?: boolean;
}

function thenable(call: Call, tables: Record<string, Row[]>) {
  return {
    then(onOk: (r: { data: unknown[] | null; error: { message: string } | null }) => unknown) {
      const [from, to] = call.range ?? [0, Number.POSITIVE_INFINITY];
      return Promise.resolve(
        onOk({ data: (tables[call.table] ?? []).slice(from, to + 1), error: null }),
      );
    },
  };
}

function makeClient(tables: Record<string, Row[]>) {
  const calls: Call[] = [];
  const client: RowsClient = {
    from(table: string) {
      return {
        select() {
          const call: Call = { table };
          calls.push(call);
          const probe = {} as {
            eq(c: string, v: unknown): CallProbe;
            in(c: string, v: unknown[]): CallProbe;
            order(c: string, o?: { ascending?: boolean }): CallProbe;
            range(f: number, t: number): { then(onOk: (r: { data: unknown[] | null; error: { message: string } | null }) => unknown): Promise<unknown> };
          };
          type CallProbe = typeof probe;
          probe.eq = () => probe;
          probe.in = (column: string, values: unknown[]) => {
            call.in = [column, values];
            return probe;
          };
          probe.order = () => {
            call.ordered = true;
            return probe;
          };
          probe.range = (from: number, to: number) => {
            call.range = [from, to];
            return thenable(call, tables);
          };
          return probe as unknown as RowQuery;
        },
        // deck_card_counts aggregation: groups the stored rows like Postgres would.
        async rpc(fn: string, params: Record<string, unknown>) {
          if (fn !== 'deck_card_counts') {
            return { data: null, error: { message: `unknown function ${fn}` } };
          }
          const ids = (params.p_deck_ids ?? []) as string[];
          const grouped = ids
            .map(id => ({ deck_id: id, cards: (tables.cards ?? []).filter(c => c.deck_id === id).length }))
            .filter(r => r.cards > 0);
          return { data: grouped, error: null };
        },
      };
    },
  };
  return { client, calls };
}

describe('fetchAllPages', () => {
  it('returns 2,500 rows complete across paged windows, in order', async () => {
    const bigTable = Array.from({ length: 2500 }, (_, i) => ({ id: `${i}` }));
    const { client, calls } = makeClient({ cards: bigTable });

    const rows = (await fetchAllPages(
      client,
      'cards',
      '*',
      query => query.eq('user_id', 'u1').order('id', { ascending: true }),
    )) as { id: string }[];

    // Windows walk 0/1000, 1000/1999, 2000/2999 and stop at the short page.
    expect(calls.map(c => c.range?.[0])).toEqual([0, 1000, 2000]);
    expect(rows).toHaveLength(2500);
    expect(rows.every((row, i) => row.id === String(i))).toBe(true);
  });

  it('short-circuits on a short page without extra requests', async () => {
    const { client, calls } = makeClient({ cards: [{ id: 'only' }] });
    const rows = await fetchAllPages(client, 'cards', '*', query => query.eq('user_id', 'u1').order('id'));
    expect(rows).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('surfaces a page error instead of swallowing it', async () => {
    const failing: RowsClient = {
      from() {
        return {
          select() {
            const probe = {} as {
              eq(): typeof probe;
              order(): typeof probe;
              range(f: number, t: number): { then(onOk: (r: { data: unknown[] | null; error: { message: string } | null }) => unknown): Promise<unknown> };
            };
            probe.eq = () => probe;
            probe.order = () => probe;
            probe.range = () => ({
              then(onOk: (r: { data: unknown[] | null; error: { message: string } | null }) => unknown) {
                return Promise.resolve(onOk({ data: null, error: { message: 'RLS said no' } }));
              },
            }) as unknown as {
              then(onOk: (r: { data: unknown[] | null; error: { message: string } | null }) => unknown): Promise<unknown>;
            };
            return probe as unknown as RowQuery;
          },
          async rpc() {
            return { data: null, error: { message: 'rls' } };
          },
        };
      },
    };
    await expect(
      fetchAllPages(failing, 'cards', '*', query => query.eq('user_id', 'u1').order('id')),
    ).rejects.toMatchObject({ message: 'RLS said no' });
  });
});

describe('the service wirings', () => {
  const WEB = path.resolve(__dirname, '../..');

  it('fetchCards pages via the shared helper', () => {
    const src = readFileSync(path.join(WEB, 'src/services/database/modules/cardService.ts'), 'utf8');
    expect(src).toMatch(/fetchAllPages/);
  });

  it('deck counts prefer the RPC and fall back to paged, ordered counting', () => {
    const src = readFileSync(path.join(WEB, 'src/services/database/modules/deckService.ts'), 'utf8');
    expect(src).toMatch(/rpc\('deck_card_counts'/);
    expect(src).toMatch(/fetchAllPages/);
    // The old one-shot unpaged count fetch (no order, .in() with a
    // data.map list) must not come back.
    expect(src).not.toMatch(/\.in\('deck_id', \(data \?\? \[\]\)\.map/);
    expect(src).toMatch(/in\('deck_id', deckIds\)\.order/);
  });
});

describe('a human must apply the migration', () => {
  it('exists and follows the executor lockdown convention', () => {
    const sql = readFileSync(
      path.resolve(__dirname, '../../../supabase/migrations/20261029120000_deck_card_counts.sql'),
      'utf8',
    );
    expect(sql).toMatch(/create or replace function public\.deck_card_counts/);
    expect(sql).toMatch(/security invoker/);
    expect(sql).toMatch(/revoke execute .* from public, anon/);
    expect(sql).toMatch(/grant execute .* to authenticated/);
  });
});

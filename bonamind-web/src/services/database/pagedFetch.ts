/**
 * PostgREST returns at most 1000 rows per request. Any multi-page read
 * (cards, decks, aggregation series) must walk `.range()` pages until a
 * short page arrives, or big libraries silently truncated. Before this
 * helper existed, fetchCards loaded only the first 1,000 cards — the rest
 * vanished from the app with no error.
 *
 * The database client is a minimal structural subset of supabase-js (callers
 * pass their client; tests drive it with mocks). Callers shape the query
 * through `applyFilters` so count columns, ordering and eq/in filters stay
 * with the call site.
 */

export const PAGE_SIZE = 1000;

export interface RowQuery {
  eq(column: string, value: unknown): RowQuery;
  in(column: string, values: unknown[]): RowQuery;
  order(column: string, options?: { ascending?: boolean }): RowQuery;
  range(from: number, to: number): RowQuery;
  then(
    onOk: (r: { data: unknown[] | null; error: { message: string } | null }) => unknown,
    onRejected?: (e: unknown) => unknown,
  ): Promise<unknown>;
}

/**
 * The PostgREST subset this module needs. Exported for call sites handing
 * in a supabase-js client: the runtime shape above is exact, but
 * supabase-js's types also carry the full Promise interface, so the subset
 * type is the honest shape to receive.
 */
export interface RowsClient {
  from(table: string): {
    select(columns: string): RowQuery;
    rpc(fn: string, params: Record<string, unknown>): Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
}

export async function fetchAllPages(
  client: RowsClient,
  table: string,
  columns: string,
  applyFilters: (query: RowQuery) => RowQuery,
  pageSize: number = PAGE_SIZE,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await applyFilters(
      client.from(table).select(columns) as unknown as RowQuery,
    )
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
    offset += pageSize;
  }
}

/**
 * Builds the data export the privacy policy promises: profile, decks,
 * cards, review history and study sessions, straight from the user's own
 * rows, plus this browser's local preferences.
 *
 * Two honesty rules drove this module: the export must cover every surface
 * the privacy policy names, and it must page — Postgres caps one request at
 * 1000 rows, and a single-shot export would silently drop everything past
 * that for heavy users.
 *
 * The database client is a minimal structural interface so tests can drive
 * it without a live database; callers pass `requireSupabase()` (RLS still
 * guards the real one).
 */

const PAGE_SIZE = 1000;

export interface DataExport {
  exportedAt: string;
  profile: unknown;
  decks: unknown[];
  cards: unknown[];
  cardReviews: unknown[];
  studySessions: unknown[];
  localPreferences: Record<string, string | null>;
}

interface RowQuery {
  eq(column: string, value: unknown): RowQuery;
  range(from: number, to: number): RowQuery;
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
  then(
    onOk: (r: { data: unknown[] | null; error: { message: string } | null }) => unknown,
    onRejected?: (e: unknown) => unknown,
  ): Promise<unknown>;
}

/**
 * The PostgREST subset this module needs. Exported so call sites can hand
 * in a supabase-js client: supabase-js's builder has this exact API at
 * runtime, but its types carry the full Promise interface, so the subset
 * type is the honest shape to receive. Tests use mocks matching it.
 */
export interface RowsClient {
  from(table: string): {
    select(columns: string): RowQuery;
  };
}

async function fetchProfile(client: RowsClient, userId: string): Promise<unknown> {
  const { data, error } = await client
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Fetch every row for the user, paging through the 1000-row request cap. */
export async function fetchAllRows(client: RowsClient, table: string, userId: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    offset += PAGE_SIZE;
  }
}

export async function buildDataExport(
  userId: string,
  localPreferences: Record<string, string | null> = {},
  client: RowsClient,
): Promise<DataExport> {
  const [profile, decks, cards, cardReviews, studySessions] = await Promise.all([
    fetchProfile(client, userId),
    fetchAllRows(client, 'decks', userId),
    fetchAllRows(client, 'cards', userId),
    fetchAllRows(client, 'card_reviews', userId),
    fetchAllRows(client, 'study_sessions', userId),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    profile,
    decks,
    cards,
    cardReviews,
    studySessions,
    localPreferences,
  };
}

/**
 * An Anki-importable TSV: one note per row, `front<TAB>back`. Tabs and
 * newlines inside a field would break the row format, so they collapse to
 * spaces (Anki strips HTML itself when configured to).
 */
export function ankiTsv(cards: { front: string; back: string }[]): string {
  const field = (text: string): string => text.replace(/\t|\r?\n/g, ' ').trim();
  return cards.map((card) => `${field(card.front)}\t${field(card.back)}`).join('\n') + '\n';
}

export function downloadTextFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

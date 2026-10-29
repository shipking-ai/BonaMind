/**
 * Timestamp serialization helpers for JS → Postgres TIMESTAMPTZ columns.
 *
 * The JS-side `Card` (in `src/types`) and offline queue types store timestamps
 * as `number` (ms-since-epoch) because that's what every browser UI uses for
 * `≤ Date.now()` due-date comparisons. The Postgres side declares columns
 * like `cards.last_reviewed`, `cards.next_review`, `user_profiles.joined_date`
 * as `TIMESTAMP WITH TIME ZONE`, which PostgREST expects to receive as an
 * ISO-8601 string.
 *
 * If the client sends the raw integer (`Date.now()`), Postgres treats it as
 * a `date/time` literal attempt, fires **22008 datetime_field_overflow**,
 * and the PATCH returns 400. The "Supabase updateCard failed (keeping
 * optimistic update)" warning in StudyModePage was this exact bug.
 *
 * The helpers below centralize the conversion so:
 *   - Number → ISO UTC string  (the wire format PostgREST accepts)
 *   - String → string passthrough (if a future caller already passes ISO)
 *   - null/undefined → undefined (so the SQL builder omits the column)
 *   - Invalid (NaN/Infinity/garbage) → undefined (silent drop, log later)
 *
 * Round-trip read-side helpers (`parseDbTimestamp`) exist in `fsrsAdaptation.ts`
 * already; we intentionally don't reuse them because the write path needs a
 * different shape (read returns Date for display; write returns ISO string
 * for transport), and mixing them would let a future refactor silently flip
 * the wire shape.
 */

/**
 * Coerce a JS-side timestamp (number | string | null | undefined) to an ISO
 * 8601 UTC string the Postgres TIMESTAMPTZ column can parse.
 *
 * Returns `undefined` for inputs the JS caller shouldn't have written in
 * the first place (null/undefined) AND for invalid (NaN, Infinity, empty
 * string) inputs — the SQL builder will then omit the column, which means
 * an `UPDATE … SET col = omited` keeps the existing column value. That is
 * the safest default for a sanitizer that should never crash the caller.
 *
 * Examples:
 *   toIsoOrUndef(1784507459794)        → '2026-...Z'
 *   toIsoOrUndef('2026-01-01T00:00:00Z') → '2026-01-01T00:00:00Z'  (passthrough)
 *   toIsoOrUndef(null)                 → undefined
 *   toIsoOrUndef(undefined)            → undefined
 *   toIsoOrUndef(NaN)                  → undefined
 *   toIsoOrUndef('')                   → undefined
 *   toIsoOrUndef('not a date')         → undefined  (caller needs to know)
 */
export function toIsoOrUndef(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    if (value === '') return undefined;
    // If it parses as Date.parse-able, normalize to ISO; else passthrough
    // (Postgres will surface 22008 itself on garbage so this is loud-fail).
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return new Date(value).toISOString();
  }
  return undefined;
}

/**
 * Convenience: produce a non-undefined ISO string OR null. Useful when the
 * SQL builder distinguishes "drop column" (omit) from "explicit NULL write"
 * (send key with value null). Postgres interprets NULL as "set this column
 * to NULL", which is sometimes wanted (e.g., clear `last_reviewed` on
 * deck reset).
 *
 * Examples:
 *   toIsoOrNull(1784507459794)  → '2026-...Z'
 *   toIsoOrNull(null)           → null
 *   toIsoOrNull(undefined)      → null
 *   toIsoOrNull(NaN)            → null
 */
export function toIsoOrNull(value: unknown): string | null {
  return toIsoOrUndef(value) ?? null;
}

/**
 * Rack-check helper for the regression tests. Returns true when an
 * arbitrary value would survive the serializer as a TIMESTAMPTZ literal.
 * False positives falsify the test; false negatives tolerate any input we'd
 * never see in production (Date objects, Mongoose-style nested).
 *
 *   isTimetzCompatible('2026-01-01T00:00:00Z') → true
 *   isTimetzCompatible('2026-01-01 00:00:00')  → true  (ISO with space)
 *   isTimetzCompatible(1784507459794)          → false  (raw int = bug)
 *   isTimetzCompatible('loltime')              → false  (garbage)
 */
export function isTimetzCompatible(value: unknown): boolean {
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms);
  }
  // Anything non-string is non-postable as TIMESTAMPTZ literal. Numbers
  // are the bug-shape; booleans/objects/arrays are obviously wrong.
  return false;
}

/**
 * Read-side counterpart of `toIsoOrUndef`. Postgres TIMESTAMPTZ columns
 * are wire-stored as ISO 8601 strings, but the in-memory `Card` type and
 * dozens of UI components assume timestamps are JS numbers (ms-since-epoch)
 * for due-date arithmetic like `c.nextReview <= Date.now()`.
 *
 * JS coerces `"2026-..."` to NaN on numeric comparison, so a passthrough
 * mapping (the previous behavior) silently returned `false` from every
 * due-card filter after the first round-trip — every freshly-reviewed card
 * became "never due right now". This helper normalizes back to ms-epoch.
 *
 * Returns `undefined` for NULL / undefined / garbage — preserves the
 * "I have no review timestamp yet" semantics that allow UI gating
 * (e.g. lastReviewed stays undefined before first review).
 *
 *   parseIsoToMsOrUndef('2026-01-01T00:00:00Z') → Date.parse(...) (≈ 1767225600000)
 *   parseIsoToMsOrUndef(1234567890)              → 1234567890   (passthrough)
 *   parseIsoToMsOrUndef(null)                    → undefined
 *   parseIsoToMsOrUndef('not-a-date')            → undefined
 *   parseIsoToMsOrUndef(NaN)                     → undefined
 */
export function parseIsoToMsOrUndef(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    if (value === '') return undefined;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : undefined;
  }
  return undefined;
}

/**
 * Like `parseIsoToMsOrUndef`, but falls back to `Date.now()` for any
 * unparseable / sentinel input. This preserves the existing semantic
 * `c.nextReview = row.next_review || Date.now()` had before the sanitizer:
 * a NULL last_reviewed shows up as "due right now" (correct for
 * freshly-created cards, slightly wrong for cleared columns but always
 * safer than `undefined` for due-card filters).
 *
 *   parseIsoToMsOrNow('2026-01-01T00:00:00Z') → ms-epoch
 *   parseIsoToMsOrNow(1234567890)              → 1234567890  (passthrough)
 *   parseIsoToMsOrNow(null)                    → Date.now()
 *   parseIsoToMsOrNow('not-a-date')            → Date.now()
 */
export function parseIsoToMsOrNow(value: unknown): number {
  return parseIsoToMsOrUndef(value) ?? Date.now();
}

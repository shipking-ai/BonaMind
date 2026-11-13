/**
 * Personal FSRS-6 parameters, fitted to one user's review history with the
 * official optimizer (fsrs-rs, via @open-spaced-repetition/binding).
 *
 * The scheduler (packages/core/src/scheduling/fsrs.ts) runs FSRS-6 in
 * long-term mode with whole-day intervals and uses a personal vector only
 * when it is a complete 21-number FSRS-6 vector. This module produces one.
 *
 * Pure pieces (rating mapping, building the revlog CSV) live here so they
 * can be tested without the native optimizer; tuneFsrs6 loads it lazily so
 * no other API route pays for it.
 */
import { default_w } from 'ts-fsrs';

/**
 * Usable reviews (training items) needed before fitting. Below this a fit
 * mostly reflects noise; the optimizer's own guidance is "hundreds".
 */
export const FSRS6_MIN_REVIEWS = 400;

/** Local hour at which a new study day starts, as in Anki and fsrs-rs. */
export const NEXT_DAY_STARTS_AT = 4;

/** Upper bound on review rows read for one fit. */
export const MAX_REVIEW_ROWS = 50_000;

/**
 * Until this migration card_reviews kept only each card's latest review, so
 * a card reviewed before it went live has an incomplete history and is left
 * out of training. Its applied_at in schema_migrations is the exact cut-off;
 * the file date is the fallback.
 */
export const HISTORY_MIGRATION = '20260916000000_card_reviews_history';
export const HISTORY_FALLBACK_START = '2026-09-16T00:00:00Z';

/** The published FSRS-6 defaults the scheduler falls back to. */
export const FSRS6_DEFAULTS: readonly number[] = default_w;

export interface ReviewRow {
  card_id: string;
  rating: number | null;
  reviewed_at: string;
}

/**
 * BonaMind ratings (card_reviews.rating: 0 Again, 3 Hard, 4 Good, 5 Easy;
 * 1 and 2 are older failed-recall grades) to FSRS grades 1..4.
 */
export function fsrsRating(rating: number | null | undefined): 1 | 2 | 3 | 4 | null {
  switch (rating) {
    case 0:
    case 1:
    case 2:
      return 1;
    case 3:
      return 2;
    case 4:
      return 3;
    case 5:
      return 4;
    default:
      return null;
  }
}

export interface Revlog {
  csv: string;
  /** Cards kept for training. */
  cards: number;
  /** Review rows written to the CSV. */
  reviews: number;
  /** Cards left out because part of their history predates historyStart. */
  skippedCards: number;
}

/**
 * The review log in the CSV shape the optimizer's converter reads:
 * card_id,review_time(ms),review_rating(1..4),review_state,review_duration.
 *
 * BonaMind has no learning steps, so a card's first review is its learning
 * review (state 1) and every later one is a review (state 2). The converter
 * drops cards whose history does not start with a learning review.
 */
export function buildRevlog(rows: readonly ReviewRow[], historyStart: Date): Revlog {
  const byCard = new Map<string, Array<{ at: number; rating: number }>>();
  const tooOld = new Set<string>();
  const start = historyStart.getTime();

  for (const row of rows) {
    const at = Date.parse(row.reviewed_at);
    if (!row.card_id || !Number.isFinite(at)) continue;
    if (at < start) {
      tooOld.add(row.card_id);
      continue;
    }
    const rating = fsrsRating(row.rating);
    if (rating === null) continue;
    const list = byCard.get(row.card_id) ?? [];
    list.push({ at, rating });
    byCard.set(row.card_id, list);
  }

  const lines = ['card_id,review_time,review_rating,review_state,review_duration'];
  let cards = 0;
  let reviews = 0;
  for (const [cardId, list] of byCard) {
    if (tooOld.has(cardId)) continue;
    cards++;
    list.sort((a, b) => a.at - b.at);
    list.forEach((review, i) => {
      lines.push(`${cards},${review.at},${review.rating},${i === 0 ? 1 : 2},0`);
      reviews++;
    });
  }
  return { csv: lines.join('\n'), cards, reviews, skippedCards: tooOld.size };
}

/** A real IANA time zone name, or UTC. */
export function resolveTimeZone(timeZone: unknown): string {
  if (typeof timeZone !== 'string' || timeZone.length === 0 || timeZone.length > 64) return 'UTC';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/** A complete FSRS-6 vector: 21 finite numbers. */
export function isFsrs6Vector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === FSRS6_DEFAULTS.length &&
    value.every((w) => typeof w === 'number' && Number.isFinite(w))
  );
}

export type TuneResult =
  | { status: 'tuned'; parameters: number[]; reviews: number; logLoss: number; defaultLogLoss: number }
  | { status: 'no-improvement'; reviews: number; logLoss: number; defaultLogLoss: number }
  | { status: 'not-enough-data'; reviews: number; needed: number };

type Binding = typeof import('@open-spaced-repetition/binding');

const loadBinding = (): Promise<Binding> => import('@open-spaced-repetition/binding');

/**
 * Fits FSRS-6 to the rows and keeps the result only if it predicts this
 * user's recall better (lower log loss) than the published defaults.
 */
export async function tuneFsrs6(
  rows: readonly ReviewRow[],
  opts: { historyStart: Date; timeZone: string },
  load: () => Promise<Binding> = loadBinding,
): Promise<TuneResult> {
  const revlog = buildRevlog(rows, opts.historyStart);
  // Training items are a subset of reviews, so too few reviews settles it
  // without loading the optimizer.
  if (revlog.reviews < FSRS6_MIN_REVIEWS) {
    return { status: 'not-enough-data', reviews: revlog.reviews, needed: FSRS6_MIN_REVIEWS };
  }

  const binding = await load();
  const items = binding.convertCsvToFsrsItems(
    new TextEncoder().encode(revlog.csv),
    NEXT_DAY_STARTS_AT,
    resolveTimeZone(opts.timeZone),
    'FSRS-6',
  );
  if (items.length < FSRS6_MIN_REVIEWS) {
    return { status: 'not-enough-data', reviews: items.length, needed: FSRS6_MIN_REVIEWS };
  }

  // Short-term (same-day) scheduling is off in the scheduler, so it is off
  // in training too.
  const fitted: unknown = await binding.computeParameters(items, {
    modelVersion: 'FSRS-6',
    enableShortTerm: false,
  });
  if (!isFsrs6Vector(fitted)) {
    throw new Error(`optimizer returned ${Array.isArray(fitted) ? fitted.length : typeof fitted} parameters, not 21`);
  }
  const parameters = fitted;
  const defaultLogLoss = new binding.FSRSBinding([...FSRS6_DEFAULTS]).evaluate(items).logLoss;
  const logLoss = new binding.FSRSBinding(parameters).evaluate(items).logLoss;
  if (!(logLoss < defaultLogLoss)) {
    return { status: 'no-improvement', reviews: items.length, logLoss, defaultLogLoss };
  }
  return { status: 'tuned', parameters, reviews: items.length, logLoss, defaultLogLoss };
}

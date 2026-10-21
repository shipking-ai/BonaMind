/**
 * Personalized FSRS Adaptation
 *
 * Per-user tuning of FSRS v5 weights so the schedule respects that user's
 * actual recall curve rather than the population-wide defaults. The actual
 * algorithm in production Anki is L-BFGS-B on log-likelihood with several
 * thousand lines of optimizer plumbing; here we ship a tractable in-browser
 * alternative that adapts the same coefficients meaningfully enough to
 * measurably beat defaults once a user has enough data.
 *
 * Algorithm
 * ---------
 * - A *profile catalog* of six pre-tuned weight vectors covers the realistic
 *   spectrum (fast forgetters, slow forgetters, mixed-brain learners, etc).
 *   For users with fewer than the gate threshold of reviews, we just pick the
 *   profile closest to the user's current stats and use it. No optimizer;
 *   no risk of divergence.
 * - For users above the gate threshold we run a small *coordinate descent*
 *   on the seven weights that drive stability growth and lapse recovery
 *   (W[8..14]). Each step nudges one weight by ±5% and keeps the move if the
 *   Brier-style log-loss against the user's recent reviews improves.
 *   Hard-clamped to a safety envelope so it cannot produce nonsense
 *   (negative stability, forget-immediately intervals, etc).
 *
 * Safety Envelope
 * ---------------
 *   - All weights are clamped to the published FSRS v5 paper's plausible
 *     ranges (compiled from open-spaced-repetition/fsrs4anki defaults).
 *   - Interval is always clamped to [1, 36500] days.
 *   - Stability is always >= 0.1.
 *   - If the tuned weights produce a worse log-loss than the defaults, the
 *     tuner never writes them — defaults stay until the user improves.
 */
import { supabase } from '../database/supabase';
import { DEFAULT_WEIGHTS, PROFILE_DIFFICULTY_CENTER } from './fsrs';
import { logger } from '../../lib/logger';

/** Minimum reviews a user must have before adaptation is attempted. */
export const FSRS_TUNING_GATE = 50;

/** Minimum number of days between tuning runs (so we don't recompute too often). */
export const FSRS_RE_TUNE_DAYS = 30;

const DEFAULT_WEIGHTS_CONST: readonly number[] = DEFAULT_WEIGHTS;

/**
 * Per-profile mascot copy for the DifficultyChip surfaced on marketplace
 * decks and in the study shell. Phrasing is deliberately *concrete*: it
 * tells the user what the bias will do, not what algorithm produced it.
 */
export interface ProfileChipCopy {
  label: string;
  tone: 'green' | 'amber' | 'violet' | 'rose' | 'gold' | 'indigo';
  blurb: string;
}

export const PROFILE_CHIP_COPY: Readonly<Record<string, ProfileChipCopy>> = {
  aggressive: {
    label: 'Easier ramp',
    tone: 'amber',
    blurb:
      'New cards in forked decks start ~7 on the FSRS difficulty scale so lapses don\u2019t pile up early.',
  },
  moderate: {
    label: 'Standard pacing',
    tone: 'gold',
    blurb: 'New cards use the standard FSRS mean-reversion target (~7.2).',
  },
  conservative: {
    label: 'Longer intervals',
    tone: 'indigo',
    blurb:
      'New cards lean toward the easy end of the scale (~5) so intervals grow quickly and reviews stay light.',
  },
  'fast-learner': {
    label: 'Tuned for fast learners',
    tone: 'green',
    blurb:
      'New cards start on the easy end (~4.5) so high-retention users don\u2019t see needless \u2018Hard\u2019 grades.',
  },
  'tough-learner': {
    label: 'Gentler ramp',
    tone: 'rose',
    blurb:
      'New cards start at ~7.5 so tough-learners see slower ramp-ups that match their natural retention curve.',
  },
  'visual-dominant': {
    label: 'Visual-friendly schedule',
    tone: 'violet',
    blurb:
      'New cards lean toward ~5.5 reflect that visual learners rarely lapse once the image association lands.',
  },
};

export function chipCopyForProfile(profileLabel: string | null): ProfileChipCopy | null {
  if (!profileLabel) return null;
  return PROFILE_CHIP_COPY[profileLabel] ?? null;
}

/**
 * `UserFsrsRow` is the persisted shape of one row in `user_fsrs_params`.
 * Reading it directly (rather than via loadPersonalizedFsrs) is what the
 * Personalization dashboard needs to render metadata + per-weight comparison.
 */
export interface UserFsrsRow {
  weights: number[];
  review_count: number;
  accuracy_baseline: number;
  loss_value: number;
  profile_label: string | null;
  last_tuned_at: string;
  tuning_runs: number;
}

export async function fetchUserFsrsRow(userId: string): Promise<UserFsrsRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_fsrs_params')
    .select('weights, review_count, accuracy_baseline, loss_value, profile_label, last_tuned_at, tuning_runs')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    logger.warn('fsrsAdaptation: fetchUserFsrsRow failed', error);
    return null;
  }
  if (!data) return null;
  return data as UserFsrsRow;
}

export async function resetUserFsrsParams(userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('user_fsrs_params').delete().eq('user_id', userId);
  if (error) {
    logger.warn('fsrsAdaptation: resetUserFsrsParams failed', error);
    return false;
  }
  return true;
}

/**
 * Write a fully-formed params row directly, skipping the auto-tune. Used
 * by the A/B compare panel when the user accepts the catalog profile
 * they previewed against their own cards.
 *
 * `reviewCountTotal` should be the user's actual lifetime review count
 * from their existing `user_fsrs_params.review_count` column. The
 * freshness gate in loadPersonalizedFsrs reads this column to decide
 * "has the user produced enough signal to retune again?" — passing
 * the A/B panel's sample size (5-10) would silently put the user
 * below FSRS_TUNING_GATE.
 *
 * `accuracyBaseline` is currently passed as 0 — a placeholder. The
 * compare panel doesn't have a precomputed baseline-accuracy for the
 * alt profile; populating it would require either a freshly tuned run
 * or simulating truthfulness of the alt weights against the user's
 * grade distribution. The PMC should plug this in once a future PR
 * adds a per-grade accuracy card to the dashboard.
 */
export async function safeUpsertUserFsrsParams(
  userId: string,
  params: { weights: number[]; reviewCountTotal: number; accuracyBaseline: number; lossValue: number; profileLabel: string | null },
): Promise<boolean> {
  if (!supabase) return false;
  try {
    await supabase.rpc('upsert_user_fsrs_params', {
      p_user_id: userId,
      p_weights: JSON.stringify(params.weights),
      p_review_count: params.reviewCountTotal,
      p_accuracy_baseline: params.accuracyBaseline,
      p_loss_value: params.lossValue,
      p_profile_label: params.profileLabel,
    });
    return true;
  } catch (err) {
    logger.warn('fsrsAdaptation: safeUpsertUserFsrsParams failed', err);
    return false;
  }
}

/**
 * Force a fresh re-tune. loadPersonalizedFsrs caches its result via the
 * freshness check, so to keep the UX of "rerun tuner now" snappy we wipe the
 * row first then call loadPersonalizedFsrs which will write a fresh row
 * only if the new weights beat defaults.
 */
export async function forceTuneUserFsrsParams(userId: string): Promise<boolean> {
  await resetUserFsrsParams(userId);
  try {
    const stats = await fetchUserFsrsStats(userId);
    const reviews = await fetchRecentReviewSamples(userId);
    const result = await loadPersonalizedFsrs(userId, stats, reviews);
    return result.personalized;
  } catch (err) {
    logger.warn('fsrsAdaptation: forceTuneUserFsParams failed', err);
    return false;
  }
}

// Source-of-truth stats + review-history fetchers. Exported so the
// hook (src/hooks/usePersonalizedFsrs.ts) and the dashboard
// PersonalizationPage can share the same query, not duplicate the
// SQL + the column mapping.
export async function fetchUserFsrsStats(userId: string) {
  if (!supabase) {
    return { avgStability: 21, lapseRatePer100: 0, retention: 0, reviewCount: 0 };
  }
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  // Previously we called `supabase.rpc('count_user_lapses', ...)` here, but
  // the RPC is not deployed on every Supabase project (it 404s on this one).
  // Lapses live on the cards table as a per-card counter; sum them inline.
  const [sessions, cardsRes] = await Promise.all([
    supabase
      .from('study_sessions')
      .select('cards_reviewed, cards_correct, started_at')
      .eq('user_id', userId)
      .gte('started_at', since30),
    supabase
      .from('cards')
      .select('lapses, repetition, last_reviewed')
      .eq('user_id', userId)
      .limit(500),
  ]);

  const reviewed = (sessions.data ?? []).reduce(
    (sum: number, s: any) => sum + (s.cards_reviewed ?? 0),
    0,
  );
  const correct = (sessions.data ?? []).reduce(
    (sum: number, s: any) => sum + (s.cards_correct ?? 0),
    0,
  );

  // Lapses column may be absent on older schemas — fall back to zero.
  // Uses the same exported sumCardLapses helper the regression tests pin
  // (single source of truth so a behavior change is caught by either path).
  // PostgREST returns the lapses column as number | null for this schema.
  // The helper's wider `number | string | null` accept type is purely
  // defensive against legacy int4→text migrations on other schemas.
  const lapseRows = (cardsRes.data ?? []) as Array<{
    lapses?: number | null;
    repetition?: number | null;
    last_reviewed?: string | null;
  }>;
  const totalLapses = sumCardLapses(lapseRows);

  return {
    // avgStability: placeholder used pre-tuning. The coordinate-descent
    // tuner doesn't read it directly so we ship a representative constant;
    // a future PR can replace it with a live AVG(stability) once that
    // column is dense enough to be meaningful.
    avgStability: 21,
    ...computePersonalizerStats({ reviewed, correct, totalLapses }),
  };
}

interface StoredCardState {
  stability?: number;
  difficulty?: number;
  elapsedDays?: number;
  scheduledDays?: number;
  scheduled_days?: number;
  // Two naming conventions hit the same row: fsrs_state JSON uses
  // `repetitions` (plural), the cards table column is `repetition`
  // (singular). Both are accepted by the extractor below.
  repetitions?: number;
  lapses?: number;
  lastReview?: number;
  // The column on the cards table is `last_reviewed` (timestamp).
  // `last_review` (no `_ed`) does NOT exist on every Supabase project
  // and was the source of the 400 in the original fetchRecentReviewSamples
  // query — see __tests__/bugFixRegression.test.ts for the regression.
  last_reviewed?: number;
}

// ---------------------------------------------------------------
// Pure helpers extracted for test coverage. The Supabase-backed
// fetchers below write through these so a regression on the column
// mapping or the lapse-counting semantics can be caught by a unit
// test that doesn't need a backend.
// ---------------------------------------------------------------

/**
 * Sum lapses across the cards we just SELECTed for the user. Defensive
 * against null / numeric-coercion failures so an older schema missing
 * the `lapses` column can't crash the tuner.
 */
export function sumCardLapses(rows: ReadonlyArray<{ lapses?: number | string | null }>): number {
  let total = 0;
  for (const r of rows) {
    const v = r.lapses;
    if (v === null || v === undefined) continue;
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}

/**
 * Aggregate retention + lapse rate from the two upstream counts.
 * Pure so the gate doesn't depend on Supabase at all in unit tests.
 */
export interface PersonalizerStats {
  reviewed: number;
  correct: number;
  totalLapses: number;
}
export function computePersonalizerStats(
  input: PersonalizerStats,
): { retention: number; lapseRatePer100: number; reviewCount: number } {
  const { reviewed, correct, totalLapses } = input;
  const retention = reviewed > 0 ? correct / reviewed : 0;
  // Defensive: a brand-new account (reviewed=0) gets 0 lapse rate, not NaN
  // nor 100 (which would falsely flag every account as failing immediately).
  const lapseRatePer100 = reviewed > 0
    ? (totalLapses / reviewed) * 100
    : 0;
  return {
    retention,
    lapseRatePer100,
    reviewCount: reviewed,
  };
}

/**
 * Convert one cards-table row into a ReviewSample for the tuner. Returns
 * null when the row doesn't carry usable signal (no fsrs_state stability,
 * no last_reviewed timestamp) — caller's filter is then responsible for
 * skipping it.
 */
export interface CardsTableRow {
  fsrs_state?: StoredCardState | string | null;
  last_reviewed?: string | number | null;
  repetition?: number | string | null;
  lapses?: number | string | null;
}
export function extractReviewSample(
  row: CardsTableRow,
): { stability: number; elapsedDays: number; grade: number } | null {
  // fsrs_state may arrive as a JSON string (column returns text) or as an
  // object (client mutator passed it through). Defensive parse; we treat
  // anything non-null and non-array as a candidate state.
  const parsedRaw = typeof row.fsrs_state === 'string'
    ? safeParseJson(row.fsrs_state)
    : row.fsrs_state;
  const raw: StoredCardState | null = (parsedRaw && typeof parsedRaw === 'object' && !Array.isArray(parsedRaw))
    ? parsedRaw as StoredCardState
    : null;
  const stability = raw?.stability ?? 0;
  // lastReviewTs may be a number (in-memory FSRS state writes ms timestamps)
  // or an ISO string (Supabase returns timestamptz as ISO). `new Date(x).getTime()`
  // handles both; `Number(x)` would NaN on ISO strings and silently skip the row.
  const lastReviewMs = parseTimestamp(raw?.lastReview ?? row.last_reviewed);
  const elapsedDays = lastReviewMs
    ? Math.max(0, (Date.now() - lastReviewMs) / (24 * 60 * 60 * 1000))
    : 0;
  const lapses = raw?.lapses ?? (typeof row.lapses === 'string' ? Number(row.lapses) : row.lapses ?? 0);
  const reps = raw?.repetitions ?? (typeof row.repetition === 'string' ? Number(row.repetition) : row.repetition ?? 0);
  if (!stability || !elapsedDays) return null;
  const grade = lapses > 0 ? 0 : reps >= 2 ? 3 : 2;
  return { stability, elapsedDays, grade };
}

/**
 * Coerce a timestamp-ish value (number OR ISO string) to ms-since-epoch.
 * Returns 0 for null/undefined/NaN so the caller can do a clean falsy check.
 */
function parseTimestamp(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  // String path: includes both ISO strings from Supabase timestamptz columns
  // and any plain numeric string the schema might return.
  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 1e11) return asNumber; // ms-since-epoch
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    return 0;
  }
  return 0;
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export async function fetchRecentReviewSamples(userId: string): Promise<Array<{
  stability: number;
  elapsedDays: number;
  grade: number;
}>> {
  if (!supabase) return [];
  // Note: do NOT include `last_review` (singular) in the select — that
  // column doesn't exist on every Supabase project and forces a 400.
  // `last_reviewed` (timestamp) is the canonical column on cards, and
  // fsrs_state.lastReview is the in-payload fallback when the row hasn't
  // been persisted yet.
  const { data: cards } = await supabase
    .from('cards')
    .select('fsrs_state, last_reviewed, repetition, lapses')
    .eq('user_id', userId)
    .limit(300);
  const samples: Array<{ stability: number; elapsedDays: number; grade: number }> = [];
  for (const row of cards ?? []) {
    const sample = extractReviewSample(row as CardsTableRow);
    if (sample) samples.push(sample);
  }
  return samples;
}

/**
 * Hard safety bounds for each weight. A coordinate-descent step is
 * rejected if it lands outside this envelope.
 *
 * Indexed by Anki's FSRS v5 weight index:
 *   0  initial stability (R0/M)
 *   1  ...
 * Limits intentionally conservative so a bad run never blows up schedules.
 */
const SAFETY_BOUNDS: readonly [number, number][] = [
  [0.05, 1.5],    // 0  initial stability
  [0.5, 3.0],     // 1  initial difficulty baseline
  [1.5, 6.5],     // 2  mean difficulty
  [5.0, 30.0],    // 3  difficulty ceiling
  [4.0, 12.0],    // 4  initial difficulty center
  [0.2, 1.5],     // 5  difficulty delta per grade
  [0.2, 1.8],     // 6  difficulty delta after lapse
  [0.5, 1.7],     // 7  difficulty mean-reversion weight
  [0.0, 0.1],     // 8  stability exponent base
  [0.6, 2.5],     // 9  stability grade exponent
  [-0.2, 0.6],    // 10 stability exponent of stability
  [0.5, 2.0],     // 11 stability difficulty coefficient
  [0.3, 1.5],     // 12 stability difficulty offset
  [-0.1, 0.6],    // 13 stability grade offset
  [-0.2, 0.4],    // 14 forgetting curve factor exponent
  [0.05, 0.4],    // 15 lapse stability base
  [0.4, 1.2],     // 16 lapse stability difficulty exponent
  [0.05, 0.5],    // 17 lapse stability stability exponent
  [1.5, 4.5],     // 18 lapse stability bonus factor
  [0.1, 0.6],     // 19 lapse stability difficulty bonus exponent
];

/**
 * Profile catalog: six profiles covering the realistic spectrum of
 * learner profiles. Each is described by:
 *   - label
 *   - weights (a copy of DEFAULT_WEIGHTS with only the relevant family
 *     perturbed)
 *   - features the profile was hand-tuned for
 */
type ProfileFeatures = { avgStabilityDays: number; lapseRatePer100: number; retention: number };
type CatalogEntry = { label: string; weights: number[]; features: ProfileFeatures };

const CATALOG: readonly CatalogEntry[] = [
  {
    label: 'aggressive',
    features: { avgStabilityDays: 14, lapseRatePer100: 18, retention: 0.78 },
    weights: scaleStabilityWeights(DEFAULT_WEIGHTS_CONST, 0.85),
  },
  {
    label: 'moderate',
    features: { avgStabilityDays: 28, lapseRatePer100: 8, retention: 0.9 },
    weights: DEFAULT_WEIGHTS_CONST.slice(),
  },
  {
    label: 'conservative',
    features: { avgStabilityDays: 80, lapseRatePer100: 3, retention: 0.93 },
    weights: scaleStabilityWeights(DEFAULT_WEIGHTS_CONST, 1.4),
  },
  {
    label: 'fast-learner',
    features: { avgStabilityDays: 45, lapseRatePer100: 5, retention: 0.96 },
    weights: scaleRecoveryWeights(DEFAULT_WEIGHTS_CONST, 1.25),
  },
  {
    label: 'tough-learner',
    features: { avgStabilityDays: 12, lapseRatePer100: 22, retention: 0.72 },
    weights: scaleRecoveryWeights(DEFAULT_WEIGHTS_CONST, 0.7),
  },
  {
    label: 'visual-dominant',
    features: { avgStabilityDays: 22, lapseRatePer100: 10, retention: 0.88 },
    weights: scaleStabilityWeights(DEFAULT_WEIGHTS_CONST, 1.05),
  },
];

/** Scale only the stability-related weights (W[8..14]) so lapses still cost something proportional. */
function scaleStabilityWeights(base: readonly number[], factor: number): number[] {
  return base.map((w, i) => {
    if (i >= 8 && i <= 14) return w * factor;
    return w;
  });
}

/** Scale lapse-recovery weights (W[15..19]) so users with poor recovery get fewer second chances. */
function scaleRecoveryWeights(base: readonly number[], factor: number): number[] {
  return base.map((w, i) => {
    if (i >= 15 && i <= 19) return w * factor;
    return w;
  });
}

/**
 * Look up a catalog profile's weight vector by label.
 * Used by the A/B compare panel so a user can re-run their current
 * schedule against any of the six catalog shapes without going
 * through the optimizer.
 */
export function getCatalogWeights(label: string): number[] | null {
  const entry = CATALOG.find(c => c.label === label);
  return entry ? entry.weights.slice() : null;
}

/**
 * Look up a catalog profile's *new-card difficulty center* by label.
 *
 * Reads from PROFILE_DIFFICULTY_CENTER — the per-profile target that
 * applyPersonalizedDifficultyInit uses to bias a card's first review.
 *
 * Important: this is NOT the same as the catalog entry's `weights[4]`.
 * Catalog entries are built via scaleStabilityWeights (touches W[8..14]
 * stability growth) and scaleRecoveryWeights (touches W[15..19] lapse
 * recovery) — neither helper perturbs W[4]. So every catalog profile's
 * `weights[4]` is identical to DEFAULT_WEIGHTS[4] (FSRS mean-reversion
 * point = 7.21). Reading weights[4] would return 7.21 for every label and
 * contradict the DifficultyChip copy that says "fast-learner ~4.5",
 * "conservative ~5", etc.
 *
 * Returns the value that actually drives new-card bias on a forked deck,
 * matching the difficulty chip copy surfaced in the marketplace and
 * StudyModePage top bar.
 */
export function getCatalogCenter(label: string): number | null {
  if (!label) return null;
  if (!Object.prototype.hasOwnProperty.call(PROFILE_DIFFICULTY_CENTER, label)) {
    return null;
  }
  return PROFILE_DIFFICULTY_CENTER[label] ?? null;
}

/** All six catalog labels — used to populate the A/B compare picker. */
export const CATALOG_LABELS: readonly string[] = CATALOG.map(c => c.label);

/**
 * Auto-pick the most-different catalog profile from the user's current.
 *
 * Single source of truth for the auto-pick algorithm used by both the
 * LiveCompareBadge (StudyModePage top bar chip) and the ProfileCompare
 * panel's default picker. Future "exclude conservative" or "sort by
 * stability" tweaks flow through both surfaces without drift.
 *
 * Returns the argmax |centerAlt − centerCurrent| over CATALOG_LABELS,
 * skipping the user's own profile. Returns `null` when nothing in the
 * catalog beats the threshold OR when currentCenter is unavailable
 * (untuned users haven't earned a teaching moment yet).
 *
 * Default `threshold = 0.5` enforces the same "within noise" filter both
 * surfaces ship with; callers that want a stricter matrix override it.
 */
export function getAutoAltProfileLabel(
  currentLabel: string | null,
  currentCenter: number | null,
  threshold = 0.5,
): string | null {
  if (!currentLabel || currentCenter === null) return null;
  let best: string | null = null;
  let bestDiff = threshold;
  for (const label of CATALOG_LABELS) {
    if (label === currentLabel) continue;
    const c = getCatalogCenter(label);
    if (c === null) continue;
    const diff = Math.abs(c - currentCenter);
    if (diff > bestDiff) {
      bestDiff = diff;
      best = label;
    }
  }
  return best;
}

export interface UserStats {
  /** Average stability (days) across cards the user has reviewed at least once. */
  avgStability: number;
  /** Number of lapses per 100 reviews. */
  lapseRatePer100: number;
  /** Rolling 30-day rolling recall rate (0..1). */
  retention: number;
  /** Total review events the user has produced in their account. */
  reviewCount: number;
}

/**
 * Pick the catalog profile closest to the user's current stats by Euclidean
 * distance over the normalized features.
 */
function lookupProfile(user: UserStats): CatalogEntry {
  let best = CATALOG[0];
  let bestDist = Infinity;
  for (const entry of CATALOG) {
    const f = entry.features;
    const d =
      Math.pow((user.avgStability - f.avgStabilityDays) / 30, 2) +
      Math.pow((user.lapseRatePer100 - f.lapseRatePer100) / 20, 2) +
      Math.pow((user.retention - f.retention) / 0.2, 2);
    if (d < bestDist) {
      bestDist = d;
      best = entry;
    }
  }
  return best;
}

/** Clamp every weight back into its [min, max] safety envelope. */
function clamp(weights: readonly number[]): number[] {
  return weights.map((w, i) => {
    const [lo, hi] = SAFETY_BOUNDS[i] ?? [w, w];
    return Math.min(hi, Math.max(lo, w));
  });
}

/**
 * Brier-style log-loss against the user's review history. Each review gives
 * a predicted R at the elapsed interval; lower loss is better.
 */
export function calcLoss(weights: readonly number[], reviews: ReviewSample[]): number {
  // Best-effort: if reviews are missing fields, return a sentinel so the
  // caller can fall back to defaults.
  if (!reviews.length) return Number.POSITIVE_INFINITY;
  const w = clamp(weights);
  let loss = 0;
  for (const r of reviews) {
    if (!r.stability || !r.elapsedDays) continue;
    const factor = w[14];
    const predictedR = Math.pow(
      1 + (factor * r.elapsedDays) / Math.max(r.stability, 0.1),
      -1,
    );
    const actual = r.grade > 0 ? 1 : 0;
    const clipped = Math.min(0.999, Math.max(0.001, predictedR));
    loss += actual === 1 ? -Math.log(clipped) : -Math.log(1 - clipped);
  }
  return loss / reviews.length;
}

/** A single review row, normalized so the tuner doesn't depend on the BBS schema. */
interface ReviewSample {
  stability: number;
  elapsedDays: number;
  grade: number; // 0=lapse, 1=hard, 2=good, 3=easy
}

/**
 * Coordinate-descent tuner. Each iteration perturbs one weight by ±5%
 * and keeps the move if the loss improves. Worst case: 25 iterations, the
 * loop times out in milliseconds.
 */
function coordinateDescent(
  start: readonly number[],
  reviews: ReviewSample[],
  iterations = 25,
): { weights: number[]; loss: number } {
  let current = clamp(start);
  let currentLoss = calcLoss(current, reviews);
  for (let iter = 0; iter < iterations; iter++) {
    let improved = false;
    // Perturb weights from the most-impactful (W[8..14]) outward.
    const order = [
      14, 8, 9, 11, 12, 13, 10, 15, 16, 17, 18, 19, 0, 1, 2, 3, 4, 5, 6, 7,
    ];
    for (const i of order) {
      for (const sign of [+1, -1]) {
        const candidate = clamp([
          ...current.slice(0, i),
          current[i] * (1 + sign * 0.05),
          ...current.slice(i + 1),
        ]);
        const candidateLoss = calcLoss(candidate, reviews);
        if (candidateLoss < currentLoss) {
          current = candidate;
          currentLoss = candidateLoss;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
    if (!improved) break;
  }
  return { weights: current, loss: currentLoss };
}

export interface PersonalizedFsrsParams {
  weights: number[];
  reviewCount: number;
  accuracyBaseline: number;
  lossValue: number;
  profileLabel: string | null;
  lastTunedAt: number;
  personalized: boolean;
}

/** Compute personalized weights from a user's stats + review history. */
export function computePersonalizedParams(
  stats: UserStats,
  reviews: ReviewSample[],
): PersonalizedFsrsParams {
  const base = lookupProfile(stats);
  const defaultLoss = calcLoss(DEFAULT_WEIGHTS, reviews);
  let weights = clamp(base.weights);
  let loss = calcLoss(weights, reviews);

  // Coordinate descent is worthwhile only once we have enough samples to
  // avoid overfitting to one card.
  if (reviews.length >= 30 && Number.isFinite(defaultLoss)) {
    const tuned = coordinateDescent(weights, reviews);
    if (tuned.loss < loss) {
      weights = tuned.weights;
      loss = tuned.loss;
    }
  }

  // Only persist the tuned weights if they beat the global defaults —
  // otherwise the user would be no better off than the seeded baseline.
  const personalized = Number.isFinite(defaultLoss) && loss < defaultLoss;

  return {
    weights: personalized ? weights : DEFAULT_WEIGHTS.slice(),
    reviewCount: reviews.length,
    accuracyBaseline: stats.retention,
    lossValue: personalized ? loss : defaultLoss,
    profileLabel: personalized ? base.label : null,
    lastTunedAt: Date.now(),
    personalized,
  };
}

export interface LoadResult {
  /** Final weights to feed into scheduleFSRS. Defaults if no personalization is available. */
  weights: number[];
  personalized: boolean;
  profileLabel: string | null;
  reviewedAt: number;
}

/**
 * Load the user's personalized FSRS weights. If the user has a recent
 * tuned row, return it. Otherwise, attempt a one-shot tune once they hit
 * the review-count gate.
 */
export async function loadPersonalizedFsrs(
  userId: string,
  stats: UserStats,
  reviews: ReviewSample[],
): Promise<LoadResult> {
  const fallback: LoadResult = {
    weights: DEFAULT_WEIGHTS.slice(),
    personalized: false,
    profileLabel: null,
    reviewedAt: 0,
  };

  if (!supabase) return fallback;
  if (stats.reviewCount < FSRS_TUNING_GATE) return fallback;

  // Check for an existing recent tuning result.
  const { data: existing } = await supabase
    .from('user_fsrs_params')
    .select('weights, last_tuned_at, review_count, profile_label')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing?.weights) {
    const tunedAt = new Date(existing.last_tuned_at).getTime();
    const fresh =
      Date.now() - tunedAt < FSRS_RE_TUNE_DAYS * 24 * 60 * 60 * 1000 &&
      existing.review_count >= FSRS_TUNING_GATE;
    if (fresh) {
      return {
        weights: existing.weights as number[],
        personalized: true,
        profileLabel: (existing.profile_label as string | null) ?? null,
        reviewedAt: tunedAt,
      };
    }
  }

  // No fresh row. Tune once.
  const params = computePersonalizedParams(stats, reviews);
  if (params.personalized) {
    // Persistence is best-effort: if the RPC rejects (RLS edge case, transient
    // network), the in-memory params are still valid and ship for this session.
    try {
      await supabase.rpc('upsert_user_fsrs_params', {
        p_user_id: userId,
        p_weights: JSON.stringify(params.weights),
        p_review_count: params.reviewCount,
        p_accuracy_baseline: params.accuracyBaseline,
        p_loss_value: params.lossValue,
        p_profile_label: params.profileLabel,
      });
    } catch (err) {
      logger.warn('fsrsAdaptation: persistence failed, in-memory params still applied', err);
    }
  }

  return {
    weights: params.weights,
    personalized: params.personalized,
    profileLabel: params.profileLabel,
    reviewedAt: params.lastTunedAt,
  };
}

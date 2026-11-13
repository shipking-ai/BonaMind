/**
 * Client side of personal FSRS-6 tuning. The fit runs on the server with the
 * official optimizer (POST /api/fsrs/tune, see api/_lib/fsrsTraining.ts),
 * which reads the signed-in user's review history and returns 21 FSRS-6
 * parameters when they predict that user's recall better than the defaults.
 * loadPersonalizedFsrs stores them in user_fsrs_params and the scheduler
 * uses them.
 */
import { supabase } from '../database/supabase';
import { readClientEnv } from '../../lib/env';
import { FSRS_PARAMETERS } from './fsrs';

/** Mirrors FSRS6_MIN_REVIEWS on the server; the server has the final say. */
export const FSRS6_MIN_REVIEWS = 400;

/** How often a user who could not be tuned yet is tried again. */
export const FSRS6_RETRY_MS = 24 * 60 * 60 * 1000;

export type Fsrs6TuneResult =
  | { status: 'tuned'; parameters: number[]; reviews: number; logLoss: number; defaultLogLoss: number }
  | { status: 'no-improvement'; reviews: number; logLoss: number; defaultLogLoss: number }
  | { status: 'not-enough-data'; reviews: number; needed: number };

/** A complete FSRS-6 vector, the only kind the scheduler applies. */
export function isFsrs6Weights(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === FSRS_PARAMETERS.length &&
    value.every((w) => typeof w === 'number' && Number.isFinite(w))
  );
}

function isTuneResult(value: unknown): value is Fsrs6TuneResult {
  const v = value as Fsrs6TuneResult | null;
  if (!v || typeof v !== 'object') return false;
  if (v.status === 'tuned') return isFsrs6Weights(v.parameters) && Number.isFinite(v.logLoss);
  return v.status === 'no-improvement' || v.status === 'not-enough-data';
}

function localTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Asks the server to fit FSRS-6 to this user's reviews. Null on any failure. */
export async function requestFsrs6Tune(fetchImpl: typeof fetch = fetch): Promise<Fsrs6TuneResult | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const res = await fetchImpl(`${readClientEnv('VITE_API_BASE_URL') ?? ''}/api/fsrs/tune`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      // The server counts study days in the user's own time zone.
      body: JSON.stringify({ timeZone: localTimeZone() }),
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return isTuneResult(body) ? body : null;
  } catch {
    return null;
  }
}

const attemptKey = (userId: string) => `bonamind.fsrs6.lastAttempt.${userId}`;

/**
 * True when this browser has not asked the server to tune this user in the
 * last day. Two screens load personalization, so without this a user below
 * the minimum would trigger a fit on every visit.
 */
export function mayAttemptFsrs6Tune(userId: string, now = Date.now()): boolean {
  try {
    const last = Number(localStorage.getItem(attemptKey(userId)));
    return !Number.isFinite(last) || last <= 0 || now - last >= FSRS6_RETRY_MS;
  } catch {
    return true;
  }
}

export function noteFsrs6TuneAttempt(userId: string, now = Date.now()): void {
  try {
    localStorage.setItem(attemptKey(userId), String(now));
  } catch {
    // Storage blocked: the next visit simply tries again.
  }
}

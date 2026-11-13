import { Capacitor } from '../../lib/nativeShim';
import type { Card } from '../../types';
import { buildReviewPayload, type GradeResult } from './wearPayload';
import { applyWatchGrade } from './wearGradeService';

function wearPlugin(): any {
  return (Capacitor as any)?.Plugins?.WearSync;
}

export interface WearSyncSources {
  getCards: () => Card[];
  getStreak: () => Promise<number>;
  getReviewedToday: () => number;
  getDueCount: () => number;
  getUserId: () => string | null;
}

let sources: WearSyncSources | null = null;

export function initWearSync(opts: WearSyncSources) {
  sources = opts;

  const WearSync = wearPlugin();
  if (WearSync?.addListener) {
    // No .catch() on the result. Capacitor returns a PluginListenerHandle --
    // a plain object with remove() -- not a promise, so chaining .catch onto
    // it throws "addListener(...).catch is not a function" and takes the
    // whole dashboard down with it.
    //
    // This sat here harmlessly for as long as WearSync was never registered
    // (registerPlugin ran after super.onCreate, so the plugin did not exist
    // and this guard simply skipped). Fixing the registration order made the
    // guard pass for the first time and the latent crash fired immediately.
    try {
      WearSync.addListener('onGradeResult', (grade: GradeResult) => handleWatchGrade(grade));
    } catch {
      // A watch listener is optional; never let it break the dashboard.
    }
  }

  return { pushNow };
}

/**
 * Applies one grade from the watch, then tells the phone it may drop the
 * grade's item from the watch link. Until then the item stays there, so a
 * grade that arrives while the app is closed, or before its cards have
 * loaded, is applied by a later replay instead of being lost.
 */
export async function handleWatchGrade(grade: GradeResult): Promise<void> {
  if (!sources) return;
  const userId = sources.getUserId();
  if (!userId) return;
  const cards = sources.getCards();
  const outcome = await applyWatchGrade({ grade, cards, userId });
  const done =
    outcome.applied ||
    outcome.reason === 'duplicate' ||
    // With the cards loaded, a grade for a card that is not among them (a
    // deleted card, another account's card) can never apply.
    (outcome.reason === 'unknown-card' && cards.length > 0);
  if (done && grade.uri) {
    try {
      await wearPlugin()?.ackGrade?.({ uri: grade.uri });
    } catch {
      // The grade is replayed and recognised as a duplicate next time.
    }
  }
  if (outcome.applied) await pushNow();
}

/**
 * Asks the phone to deliver every grade still waiting on the watch link:
 * those that arrived while the app was closed, or before the cards loaded.
 */
export async function replayWatchGrades(): Promise<void> {
  if (!sources || sources.getCards().length === 0) return;
  try {
    await wearPlugin()?.replayPendingGrades?.();
  } catch {
    // Older native shells lack the method; their grades arrive live only.
  }
}

export async function pushNow(): Promise<void> {
  if (!sources) return;
  const WearSync = wearPlugin();
  if (!WearSync?.pushReviewPayload) return;
  const payload = buildReviewPayload({
    cards: sources.getCards(),
    streak: await sources.getStreak(),
    reviewedToday: sources.getReviewedToday(),
    dueCount: sources.getDueCount(),
  });
  try {
    await WearSync.pushReviewPayload({ payload });
  } catch {
    // No paired watch → the Wear data layer call simply fails; app unchanged.
  }
}
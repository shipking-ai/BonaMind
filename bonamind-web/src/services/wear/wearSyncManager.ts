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
      WearSync.addListener('onGradeResult', async (grade: GradeResult) => {
        if (!sources) return;
        const userId = sources.getUserId();
        if (!userId) return;
        await applyWatchGrade({ grade, cards: sources.getCards(), userId });
        await pushNow();
      });
    } catch {
      // A watch listener is optional; never let it break the dashboard.
    }
  }

  return { pushNow };
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
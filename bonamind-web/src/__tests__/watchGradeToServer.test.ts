import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { LEGACY_PREFIX } from '../lib/legacyNames';

/**
 * A watch grade reaches the database: the event the phone's WearSync plugin
 * fires (the shape WearSyncPlugin.gradeFrom builds) goes through the app's
 * own listener and services into the real `cards` and `card_reviews` tables,
 * written as the signed-in user, so row-level security applies.
 *
 * The watch half (review on the watch -> grade item on the data layer) is
 * covered by wear/src/androidTest/.../ReviewFlowTest.kt.
 *
 * Runs only against a LOCAL Supabase (`supabase start`, http on localhost),
 * which CI's e2e job provides; it never runs against a deployed project.
 */

const url = process.env.VITE_SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url) && serviceKey !== '';
if (process.env.E2E_REQUIRE_SEED && !local) {
  throw new Error('E2E_REQUIRE_SEED is set but no local Supabase is configured');
}

const plugin = vi.hoisted(() => ({
  listeners: {} as Record<string, (g: unknown) => Promise<void>>,
  ackGrade: vi.fn(async (_: { uri: string }) => ({})),
}));

vi.mock('../lib/nativeShim', () => ({
  Capacitor: {
    // The phone app: also picks the auth flow the Android app uses.
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: {
      WearSync: {
        addListener: (name: string, fn: (g: unknown) => Promise<void>) => {
          plugin.listeners[name] = fn;
          return { remove: () => {} };
        },
        ackGrade: plugin.ackGrade,
        pushReviewPayload: async () => ({ ok: true }),
      },
    },
  },
}));

describe.skipIf(!local)('a watch grade reaches the database', () => {
  let admin: SupabaseClient;
  let userId = '';
  let cardId = '';

  beforeAll(async () => {
    admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const email = `e2e-watch-${Date.now()}@example.com`;
    const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    userId = created.user.id;

    const { data: deck, error: deckErr } = await admin
      .from('decks')
      .insert({ user_id: userId, name: 'Watch deck' })
      .select('id')
      .single();
    if (deckErr) throw deckErr;
    const { data: card, error: cardErr } = await admin
      .from('cards')
      .insert({ user_id: userId, deck_id: deck.id, front: 'Capital of France?', back: 'Paris' })
      .select('id')
      .single();
    if (cardErr) throw cardErr;
    cardId = card.id;

    // Sign the APP's client in, as clicking a magic link would.
    const { supabase } = await import('../services/database/supabase');
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (linkErr) throw linkErr;
    const { error: otpErr } = await supabase!.auth.verifyOtp({
      type: 'magiclink',
      token_hash: link.properties.hashed_token,
    });
    if (otpErr) throw otpErr;
  }, 30_000);

  it('records the review and reschedules the card', async () => {
    const { initWearSync } = await import('../services/wear/wearSyncManager');
    const card = { id: cardId, deckId: 'd', front: 'Capital of France?', back: 'Paris', repetition: 0 };
    initWearSync({
      getCards: () => [card] as never,
      getStreak: async () => 0,
      getReviewedToday: () => 0,
      getDueCount: () => 1,
      getUserId: () => userId,
    });

    const before = Date.now();
    const uri = `wear://watch-node/${LEGACY_PREFIX}/grade/${before}/${cardId}`;
    // Exactly what WearSyncPlugin.gradeFrom emits for a "Good" on the watch.
    await plugin.listeners.onGradeResult({ sessionId: 'watch-session', cardId, rating: 2, timestamp: before, uri });

    // The review history row is written in the background; give it a moment.
    let reviews: Array<{ user_id: string; rating: number }> = [];
    for (let i = 0; i < 40 && reviews.length === 0; i++) {
      const { data } = await admin.from('card_reviews').select('user_id, rating').eq('card_id', cardId);
      reviews = data ?? [];
      if (reviews.length === 0) await new Promise((r) => setTimeout(r, 250));
    }
    expect(reviews).toEqual([{ user_id: userId, rating: 4 }]);

    const { data: saved } = await admin
      .from('cards')
      .select('last_reviewed, next_review, interval')
      .eq('id', cardId)
      .single();
    expect(Date.parse(saved!.last_reviewed)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(saved!.next_review)).toBeGreaterThan(Date.parse(saved!.last_reviewed));

    // Saved, so the phone may drop the grade from the watch link.
    expect(plugin.ackGrade).toHaveBeenCalledWith({ uri });
  }, 30_000);
});

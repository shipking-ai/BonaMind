/**
 * Cached Supabase GET responses must not outlive the session.
 *
 * The workbox runtime cache (`supabase-api-cache` — see lib/pwa.ts) stores
 * the previous user's rows for up to an hour offline. On a shared browser,
 * a signed-out (or next) user could be served that data. Sign-out therefore
 * drops the cache, centrally, on the auth client's SIGNED_OUT event — one
 * chokepoint so every sign-out path (settings button, token loss, admin
 * kill) gets the same guarantee.
 *
 * The name must stay in sync with the runtimeCaching entry in lib/pwa.ts;
 * a test pins that.
 */

export const SUPABASE_CACHE_NAME = 'supabase-api-cache';

export async function purgeSupabaseCache(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return; // no CacheStorage here (webviews, tests)
    const keys = await caches.keys();
    const stale = keys.filter(
      (key) => key === SUPABASE_CACHE_NAME || key.startsWith(`${SUPABASE_CACHE_NAME}-`),
    );
    await Promise.all(stale.map((key) => caches.delete(key)));
    return;
  } catch {
    // Cache hygiene is best-effort; an unusable Cache API must not break sign-out.
    return;
  }
}

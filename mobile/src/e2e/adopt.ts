import { router } from 'expo-router';
import { getSupabase } from '../data/supabase';

/**
 * Adopt a minted e2e session (the runtime token) and go to Today. The token
 * is a single-use refresh token: once adopted it is rotated, so keep the
 * attempts and never retry one — a bounce back to the welcome screen would
 * otherwise loop on a dead token.
 *
 * Two deliberate design points:
 * - The function returns void; the session write never blocks navigation.
 *   supabase-js emits the auth-state event as soon as the session lands in
 *   memory, so go to Today from that event instead of awaiting
 *   refreshSession — its SecureStore write has stalled on the iOS 26.4 CI
 *   simulator, and waiting on it would strand the app on welcome forever.
 * - Navigation fires even when the write itself hangs, which keeps the
 *   two transports (deep link on Android, token file on iOS) identical.
 */
const adopted = new Set<string>();

export function adoptRuntimeSession(rt: string): void {
  // Already adopted: the token is rotated and unusable, but the deep link
  // still parked us on the e2e route, so go back to Today.
  if (adopted.has(rt)) {
    router.replace('/today');
    return;
  }
  adopted.add(rt);
  const supabase = getSupabase();
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (!session) return;
    subscription.unsubscribe();
    router.replace('/today');
  });
  void supabase.auth
    .refreshSession({ refresh_token: rt })
    .catch(() => {
      // Invalid or already-used token: no event fires, the app stays on
      // welcome, and the failing Today assert carries the diagnosis.
    })
    .then(() => {
      subscription.unsubscribe();
    });
}

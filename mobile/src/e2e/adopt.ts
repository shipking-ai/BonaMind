import { router } from 'expo-router';
import { getSupabase } from '../data/supabase';

/**
 * Adopt a minted e2e session (the runtime token) and go to Today. The token
 * is a single-use refresh token: once adopted it is rotated, so keep the
 * attempts and never retry one — a bounce back to the welcome screen would
 * otherwise loop on a dead token.
 *
 * Two deliberate design points:
 * - Navigation never waits on session persistence. The auth event fires only
 *   after the storage write completes, and bridged-async writes have stalled
 *   forever on the iOS 26.4 CI simulator — so navigate from whichever signal
 *   arrives first: the TOKEN_REFRESHED event, or the refreshSession promise
 *   resolving. The e2e client's storage is synchronous memory, but the second
 *   path keeps this working even if persistence regresses.
 * - Returning void keeps the two transports (deep link on Android, token
 *   file on iOS) identical for their callers.
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
  let navigated = false;
  const goToday = () => {
    if (navigated) return;
    navigated = true;
    router.replace('/today');
  };
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (!session) return;
    goToday();
  });
  supabase.auth
    .refreshSession({ refresh_token: rt })
    .then(({ data }) => {
      if (data.session) goToday();
    })
    .catch(() => {
      // Invalid or already-used token: no event, no session; the app stays
      // on welcome and the failing Today assert carries the diagnosis.
    })
    .finally(() => {
      subscription.unsubscribe();
    });
}

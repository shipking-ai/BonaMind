/**
 * useCurrentUserId — read the signed-in user's id once on mount, then
 * keep it in sync with auth-state changes.
 *
 * Returns:
 *  - `undefined` while the very first auth bootstrap is in flight
 *  - `null` when the visitor is anonymous (no user, signed out, or supabase
 *    unavailable)
 *  - a string id once the auth bootstrap resolves
 *
 * In addition to the one-shot bootstrap the hook subscribes to
 * supabase.auth.onAuthStateChange so signing out from a settings panel,
 * signing in via OAuth callback, or a token refresh all update consumers
 * without forcing a page reload. The listener is whitelisted to the
 * events that actually carry an active session, so future Supabase events
 * (MFA_CHALLENGE_REQUESTED, PASSWORD_RECOVERY) cannot accidentally null
 * an otherwise valid userId.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../services/database/supabase';

export type UserIdState = string | null | undefined;

// Events that produce a valid session user the hook should track.
// Anything else (SIGNED_OUT handled separately below; MFA / password-recovery
// events ignored) is left untouched so we never accidentally blank out the
// id while Supabase runs a non-session-changing flow.
const SESSION_EVENTS = new Set([
  'INITIAL_SESSION',
  'SIGNED_IN',
  'SIGNED_UP',
  'TOKEN_REFRESHED',
  'USER_UPDATED',
]);

export function useCurrentUserId(): UserIdState {
  const [userId, setUserId] = useState<UserIdState>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!supabase) {
      setUserId(null);
      return;
    }
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserId(user?.id ?? null);
    })();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT') {
        setUserId(null);
        return;
      }
      if (SESSION_EVENTS.has(event)) {
        setUserId(session?.user?.id ?? null);
      }
      // All other events — TOKEN_REFRESHED *is* in the whitelist above;
      // PASSWORD_RECOVERY / MFA_*: ignored.
    });
    // Supabase auth-js has shipped both shapes across v2 releases:
    //   - `{ data: { subscription } }` in older releases
    //   - `{ data }` where `data` itself has `.unsubscribe()` in newer
    // Both handled defensively. Subscription is torn down only in the
    // cleanup return so the listener stays live for the lifetime of the
    // component (registering + immediately unsubscribing would defeat the
    // whole purpose of subscribing).
    const subscription =
      (data as { subscription?: { unsubscribe?: () => void } } | null | undefined)
        ?.subscription
      ?? (data as { unsubscribe?: () => void } | null | undefined);
    return () => {
      cancelled = true;
      subscription?.unsubscribe?.();
    };
  }, []);

  return userId;
}

export default useCurrentUserId;

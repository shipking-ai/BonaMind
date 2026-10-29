import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '../lib/nativeShim';
import {
  consumePendingShare,
  onShareReceived,
  stageShare,
  type SharedContent,
} from '../lib/shareTarget';

/**
 * Route content shared into the app from elsewhere on the phone.
 *
 * Mounted once at the app root. Covers both delivery paths: a cold start,
 * where Android hands over the intent long before React exists and the native
 * side parks it, and a warm share, where the app is already open and an event
 * is the only signal.
 *
 * `authChecked` gates it. Navigating to the generator before the session has
 * resolved would land on a route guard and bounce the user to /auth, losing
 * the share entirely — a share that silently vanishes is worse than one that
 * waits a beat.
 */
export function useShareTarget(authChecked: boolean): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !authChecked) return;
    let cancelled = false;

    const receive = (share: SharedContent) => {
      if (cancelled) return;
      stageShare(share);
      // replace, not push: the share is how this screen was reached, so Back
      // should leave the app rather than return to an empty generator.
      navigate('/dashboard/generator', { replace: true });
    };

    void consumePendingShare().then((share) => {
      if (share) receive(share);
    });

    let unsubscribe: (() => void) | undefined;
    void onShareReceived(receive).then((off) => {
      if (cancelled) off();
      else unsubscribe = off;
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [authChecked, navigate]);
}

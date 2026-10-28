import { useEffect } from 'react';
import * as Clipboard from 'expo-clipboard';
import { env } from '../env';
import { adoptRuntimeSession } from './adopt';

const RUNTIME_LINK = /^bonamind:\/\/e2e\/session\?rt=([A-Za-z0-9_-]+)$/;

/**
 * E2E builds only: iOS 26 gates cold custom-scheme deep links behind a
 * system "Open in 'BonaMind'?" sheet whose Open button drops the URL in CI
 * (mobile-dev-inc/Maestro#2610), so openLink can never sign us in there.
 * CI plants the session link on the simulator clipboard instead
 * (`xcrun simctl pbcopy`) and the welcome screen adopts it on mount.
 */
export function ClipboardAdopt() {
  useEffect(() => {
    if (!env.e2e) return;
    void (async () => {
      const link = await Clipboard.getStringAsync();
      const rt = RUNTIME_LINK.exec(link ?? '')?.[1];
      if (rt) void adoptRuntimeSession(rt);
    })();
  }, []);
  return null;
}

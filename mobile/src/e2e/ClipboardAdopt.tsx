import { useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Text } from 'react-native';
import { env } from '../env';
import { adoptRuntimeSession } from './adopt';

// The refresh token's exact shape is not promised anywhere, so search the
// clipboard for the link rather than anchor it, and accept every base64
// family character (including +/= padding).
const RUNTIME_LINK = /bonamind:\/\/e2e\/session\?rt=([A-Za-z0-9_+\-/=.]+)/;

/**
 * E2E builds only: iOS 26 gates cold custom-scheme deep links behind a
 * system "Open in 'BonaMind'?" sheet whose Open button drops the URL in CI
 * (mobile-dev-inc/Maestro#2610), so openLink can never sign us in there.
 * CI plants the session link on the simulator clipboard instead
 * (`xcrun simctl pbcopy`) and the welcome screen adopts it on mount.
 */
export function ClipboardAdopt() {
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  useEffect(() => {
    if (!env.e2e) return;
    void (async () => {
      const link = (await Clipboard.getStringAsync()) ?? '';
      const rt = RUNTIME_LINK.exec(link)?.[1];
      if (rt) {
        void adoptRuntimeSession(rt);
      } else {
        // E2E diagnostics: values the adoption refused show up in the
        // Maestro hierarchy dump of the failing run.
        setDiagnostic(link === '' ? 'e2e clipboard empty' : `e2e clipboard rejected: ${link}`);
      }
    })();
  }, []);
  if (!env.e2e) return null;
  return <Text style={{ fontSize: 9, color: '#777' }}>{diagnostic ?? 'e2e clipboard idle'}</Text>;
}

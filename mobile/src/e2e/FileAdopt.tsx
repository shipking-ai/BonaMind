import { useEffect, useState } from 'react';
import { deleteAsync, documentDirectory, readAsStringAsync } from 'expo-file-system/legacy';
import { Text } from 'react-native';
import { env } from '../env';
import { adoptRuntimeSession } from './adopt';

// The token format is not promised anywhere, so search the file content
// rather than anchor it, and accept every base64 family character
// (refresh tokens seen so far are 12-50 chars).
const RUNTIME_TOKEN = /([A-Za-z0-9_+\-/=]{10,})/;

const TOKEN_FILE = `${documentDirectory}e2e-rt.txt`;

/**
 * E2E builds only: iOS 26 gates cold custom-scheme deep links behind a
 * system "Open in 'BonaMind'?" sheet whose Open button drops the URL in CI
 * (mobile-dev-inc/Maestro#2610), and expo-clipboard's pasteboard promise
 * stalls behind the paste-permission sheet — so openLink and the clipboard
 * can never sign us in there. CI instead writes the minted refresh token
 * straight into this app's sandbox (xcrun simctl get_app_container ->
 * Documents/e2e-rt.txt) and the welcome screen adopts it on mount.
 */
export function FileAdopt() {
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  useEffect(() => {
    if (!env.e2e) return;
    let stale = false;
    void (async () => {
      // One-shot courier: consumed (deleted) whether it reads or not.
      const content = await readAsStringAsync(TOKEN_FILE).catch(() => null);
      if (stale) return;
      void deleteAsync(TOKEN_FILE, { idempotent: true }).catch(() => undefined);
      const rt = content ? RUNTIME_TOKEN.exec(content.trim())?.[1] : undefined;
      if (rt) {
        void adoptRuntimeSession(rt);
      } else {
        setDiagnostic(content ? `e2e file rejected: ${content}` : 'e2e file missing');
      }
    })();
    return () => {
      stale = true;
    };
  }, []);
  if (!env.e2e) return null;
  return <Text style={{ fontSize: 9, color: '#777' }}>{diagnostic ?? 'e2e file idle'}</Text>;
}

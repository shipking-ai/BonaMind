import { useEffect, useState } from 'react';
import { File, Paths } from 'expo-file-system';
import { Text } from 'react-native';
import { env } from '../env';
import { adoptRuntimeSession } from './adopt';

const TOKEN_FILE_NAME = 'e2e-rt.txt';

// The refresh token's exact shape is not promised anywhere, so search the
// file content rather than anchor it, and accept every base64 family
// character (seen tokens run 12-50 chars).
const RUNTIME_TOKEN = /([A-Za-z0-9_+\-/=]{10,})/;

type TokenRead = { token?: string; note?: string };

/**
 * Reads the planted token file synchronously. Returned during render so a
 * stuck async module bridge can never leave this gate hanging; "note"
 * carries the failure diagnosis and "token" carries the minted token.
 */
function readPlantedToken(): TokenRead {
  try {
    const file = new File(Paths.document, TOKEN_FILE_NAME);
    if (!file.exists) return { note: 'e2e file missing' };
    const content = file.textSync();
    try {
      file.delete();
    } catch {
      // Deleting is tidiness; the adopt guard prevents double use.
    }
    const rt = RUNTIME_TOKEN.exec(content.trim())?.[1];
    return rt ? { token: rt } : { note: `e2e file rejected: ${content}` };
  } catch {
    return { note: 'e2e file unreachable' };
  }
}

/**
 * E2E builds only: iOS 26 gates cold custom-scheme deep links behind a
 * system "Open in 'BonaMind'?" sheet whose Open button drops the URL in CI
 * (mobile-dev-inc/Maestro#2610), so openLink can never sign us in there.
 * CI writes the minted refresh token straight into this app's sandbox
 * (`xcrun simctl get_app_container` -> Documents/e2e-rt.txt) and the
 * welcome screen adopts it here. "e2e file idle" staying on screen while
 * Today never appears means this effect never ran.
 */
export function FileAdopt() {
  const [read] = useState(readPlantedToken);
  useEffect(() => {
    if (!env.e2e || !read.token) return;
    adoptRuntimeSession(read.token);
  }, [read]);
  if (!env.e2e || read.token) return null;
  // Legible in Maestro's failure screenshots: any surviving note is the
  // diagnosis of why the adopt never navigated.
  return <Text style={{ fontSize: 13, color: '#e8e8f0' }}>{read.note ?? 'e2e file idle'}</Text>;
}

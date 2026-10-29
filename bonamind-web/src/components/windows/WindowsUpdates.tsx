/**
 * Settings → Updates in the Windows app: the installed version and a real
 * update check. The About page has the same check, but nothing in the
 * Windows app led there.
 */
import { useEffect, useState } from 'react';
import {
  checkForDesktopUpdate,
  desktopAppVersion,
  installDesktopUpdate,
  type DesktopUpdate,
} from '../../lib/desktopUpdater';

type Check =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'current' }
  | { status: 'available'; update: DesktopUpdate }
  | { status: 'installing'; update: DesktopUpdate }
  | { status: 'error'; message: string };

export function WindowsUpdates() {
  const [version, setVersion] = useState<string | null>(null);
  const [check, setCheck] = useState<Check>({ status: 'idle' });

  useEffect(() => {
    let live = true;
    void desktopAppVersion().then((v) => { if (live) setVersion(v); });
    return () => { live = false; };
  }, []);

  const runCheck = async () => {
    setCheck({ status: 'checking' });
    try {
      const update = await checkForDesktopUpdate();
      setCheck(update ? { status: 'available', update } : { status: 'current' });
    } catch {
      setCheck({ status: 'error', message: "Couldn't reach the update server. Check your connection and try again." });
    }
  };

  const install = async (update: DesktopUpdate) => {
    setCheck({ status: 'installing', update });
    try {
      await installDesktopUpdate(update);
    } catch {
      setCheck({ status: 'error', message: "The update didn't install. Try again in a moment." });
    }
  };

  return (
    <div className="win-group">
      <div className="win-field">
        <span className="win-field-label">{version ? `Version ${version}` : 'Version'}</span>
        <span className="win-muted">
          {check.status === 'current' && "You're on the latest version."}
          {(check.status === 'available' || check.status === 'installing') && `Version ${check.update.version} is available.`}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {(check.status === 'available' || check.status === 'installing') ? (
            <button
              type="button"
              className="win-button win-button-primary"
              disabled={check.status === 'installing'}
              onClick={() => void install(check.update)}
            >
              {check.status === 'installing' ? 'Updating…' : 'Restart and update'}
            </button>
          ) : (
            <button
              type="button"
              className="win-button"
              disabled={check.status === 'checking'}
              onClick={() => void runCheck()}
            >
              {check.status === 'checking' ? 'Checking…' : 'Check for updates'}
            </button>
          )}
        </span>
      </div>
      {check.status === 'error' && <div role="alert" className="win-alert">{check.message}</div>}
    </div>
  );
}

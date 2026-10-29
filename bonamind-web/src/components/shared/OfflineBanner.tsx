/**
 * OfflineBanner — shows a subtle banner when the user is offline.
 *
 * Renders nothing while online. Sits at the top of study surfaces so a
 * mid-session disconnect is visible without the user having to notice.
 * Uses the Network Information API when available, falls back to
 * navigator.onLine + online/offline events.
 */
import { useEffect, useState } from 'react';
import { WifiOff } from '../icons';

export function OfflineBanner() {
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    window.addEventListener('online', onUp);
    window.addEventListener('offline', onDown);
    return () => {
      window.removeEventListener('online', onUp);
      window.removeEventListener('offline', onDown);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300"
    >
      <WifiOff size={13} />
      You're offline — progress is saved locally and will sync when you reconnect.
    </div>
  );
}

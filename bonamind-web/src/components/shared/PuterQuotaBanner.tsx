import React, { useCallback, useEffect, useState } from 'react';
import { onAiQuotaExhausted } from '../../lib/aiQuotaSignal';

/**
 * Shown when every free AI provider the server has keys for has returned 429.
 *
 * Puter is the escape hatch: it bills the user's own Puter account, so a
 * signed-in user keeps generating at no cost to the developer. Puter's
 * sign-in is a popup and browsers only permit those from a genuine user
 * gesture, which is exactly why this is a button and not an automatic retry.
 *
 * Deliberately not a modal — the user is mid-task and their work is still
 * usable (offline template generation continues to work), so this informs
 * without seizing the screen. Dismissal lasts the session only: the next
 * exhaustion after a reload is worth mentioning again.
 */
const PuterQuotaBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');

  useEffect(() => onAiQuotaExhausted(() => {
    // Never reopen after a successful connect — quota errors already in
    // flight would otherwise pop the banner back over a working setup.
    setStatus((s) => (s === 'connected' ? s : 'idle'));
    setVisible((v) => (v ? v : true));
  }), []);

  const connect = useCallback(async () => {
    setStatus('connecting');
    try {
      // Imported lazily so the Puter SDK loader never enters the initial
      // bundle for users who never hit a quota wall.
      const { signInWithPuter } = await import('../../services/api/puterProvider');
      const ok = await signInWithPuter();
      setStatus(ok ? 'connected' : 'failed');
      if (ok) setTimeout(() => setVisible(false), 2200);
    } catch {
      setStatus('failed');
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-[#3A3A4F] bg-[#14121C] p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[#F0EFFE]">
            {status === 'connected'
              ? 'Puter connected — AI is available again'
              : 'Free AI limit reached for now'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[#9090A8]">
            {status === 'connected'
              ? 'Requests will use your Puter account from here on.'
              : status === 'failed'
                ? "Couldn't connect to Puter. Check that the sign-in popup wasn't blocked, then try again."
                : 'Connect a free Puter account to keep generating. You can still study, and offline deck generation keeps working either way.'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {status !== 'connected' && (
            <button
              type="button"
              onClick={connect}
              disabled={status === 'connecting'}
              className="min-h-[36px] rounded-md bg-[#7C3AED] px-3 text-xs font-medium text-white transition-colors hover:bg-[#6D28D9] disabled:opacity-60"
            >
              {status === 'connecting' ? 'Connecting…' : status === 'failed' ? 'Try again' : 'Connect Puter'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setVisible(false)}
            aria-label="Dismiss"
            className="min-h-[36px] rounded-md px-2 text-xs text-[#7A7A96] transition-colors hover:text-[#F0EFFE]"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default PuterQuotaBanner;

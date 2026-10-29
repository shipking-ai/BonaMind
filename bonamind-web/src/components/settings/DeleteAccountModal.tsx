/**
 * DeleteAccountModal — production-grade account deletion.
 *
 * Two steps:
 *   1. "What's the reason?" — select one or more reasons (+ optional detail),
 *      required to continue. This drives our churn analysis.
 *   2. "Confirm" — type DELETE to acknowledge it's permanent, because it is.
 *
 * On success it calls `onDeleted`, which resets local state and sends the
 * user to the landing page. The backend endpoint (/api/account/delete) also
 * logs the reason before destroying the record.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, X, Loader2, Shield } from '@/components/icons';
import { requireSupabase } from '../../services/database/supabase';

const REASONS = [
  'It costs too much',
  'Missing a feature I need',
  'Technical issues / bugs',
  'Privacy concerns',
  'It wasn’t helping me remember things',
  'Trying a different app',
  'Other',
];

interface Props {
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteAccountModal({ open, onClose, onDeleted }: Props) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasReason = useMemo(
    () => Object.values(selected).some(Boolean) || detail.trim().length >= 10,
    [selected, detail],
  );
  const confirmed = confirmText.trim().toLowerCase() === 'delete';
  const ready = hasReason && confirmed && !busy;

  if (!open) return null;

  const toggle = (r: string) => setSelected(prev => ({ ...prev, [r]: !prev[r] }));

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const reasons = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', ');
    try {
      const token = (await requireSupabase().auth.getSession()).data.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const api = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${api}/api/account/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reasons, feedback: detail.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok && json.error) throw new Error(json.error);
      onDeleted();
    } catch (e: any) {
      setError(e.message || 'Deletion failed. Try again.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-red-500/20 bg-[#111118] p-6"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            Delete account
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <p className="text-xs text-zinc-500 mb-5">
          This permanently erases your decks, cards, progress, and streak. It cannot be undone.
        </p>

        {/* Step 1 — reason */}
        <fieldset className="mb-5">
          <legend className="text-xs font-medium text-zinc-300 mb-2.5">
            Why are you leaving? <span className="text-zinc-600">(helps us improve)</span>
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {REASONS.map(r => (
              <label
                key={r}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs cursor-pointer transition-colors ${
                  selected[r]
                    ? 'border-red-500/50 bg-red-500/[0.06] text-white'
                    : 'border-[#2A2A3A] text-zinc-400 hover:border-[#3A3A4F]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!selected[r]}
                  onChange={() => toggle(r)}
                  className="accent-red-500"
                />
                {r}
              </label>
            ))}
          </div>
          <textarea
            value={detail}
            onChange={e => setDetail(e.target.value)}
            placeholder="Anything else you’d like us to know? (optional)"
            rows={2}
            className="mt-2 w-full rounded-lg border border-[#2A2A3A] bg-[#1A1A24] px-3 py-2 text-xs text-white placeholder-zinc-600 focus:border-red-500/50 focus:outline-none resize-none"
          />
        </fieldset>

        {/* Step 2 — confirm */}
        <div className="mb-5">
          <label className="flex items-center gap-2 text-xs font-medium text-zinc-300">
            <Shield className="h-3.5 w-3.5 text-red-400" />
            Type <span className="font-mono text-red-400">DELETE</span> to confirm
          </label>
          <input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && ready) submit(); }}
            placeholder="DELETE"
            className="mt-2 w-full rounded-lg border border-[#2A2A3A] bg-[#1A1A24] px-3 py-2 text-xs font-mono text-white placeholder-zinc-600 focus:border-red-500/50 focus:outline-none"
            autoComplete="off"
            autoCapitalize="characters"
          />
        </div>

        {error && <p className="mb-4 text-[11px] text-red-400">{error}</p>}

        <div className="flex gap-2 pt-4 border-t border-[#2A2A3A]/30">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-lg bg-[#2A2A3A] px-4 py-2.5 text-[11px] font-medium text-white hover:bg-[#3A3A4F] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!ready}
            className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-[11px] font-bold text-white hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {busy ? 'Deleting…' : !hasReason ? 'Choose a reason first' : !confirmed ? 'Confirm deletion' : 'Delete my account'}
          </button>
        </div>
      </div>
    </div>
  );
}
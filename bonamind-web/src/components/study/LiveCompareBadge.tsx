/**
 * Live Compare Badge — v3
 *
 * Mounts inside the StudyModePage top bar alongside PersonalizationIndicator,
 * DifficultyChip, and PacingOverride. When the user's currently-tuned profile
 * has a candidate sibling whose difficulty center differs enough to *teach*,
 * the chip surfaces with the auto-picked alt label. Tapping deep-links to
 * `/dashboard/personalization?alt={label}` so the A/B compare panel opens
 * with that catalog profile already selected.
 *
 * Visibility rules:
 *   - only when personalization is personalized (user has a tuned shape)
 *   - only when there's a catalog profile whose center differs more than a
 *     0.5-point threshold from the user's current — anything closer is just
 *     "within noise", not a teaching moment
 *   - hidden behind sessionStorage once dismissed (key: `liveCompareBadge:dismissed:{userId}`)
 *
 * Auto-pick rules live in `getAutoAltProfileLabel` (fsrsAdaptation.ts) so
 * ProfileCompare.tsx and any future surface share the same algorithm.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, ArrowRight } from '@/components/icons';
import { getAutoAltProfileLabel } from '../../services/study/fsrsAdaptation';

interface LiveCompareBadgeProps {
  profileLabel: string | null;
  profileCenter: number | null;
  userId: string | null;
}

const SESSION_KEY_PREFIX = 'liveCompareBadge:dismissed:';

export const LiveCompareBadge: React.FC<LiveCompareBadgeProps> = ({
  profileLabel,
  profileCenter,
  userId,
}) => {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  // Mirror the dismissed flag into sessionStorage so navigating to the
  // dashboard and back to study mode doesn't re-nag the user.
  useEffect(() => {
    if (!userId) return;
    const key = SESSION_KEY_PREFIX + userId;
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(key) === '1') {
      setDismissed(true);
    }
  }, [userId]);

  // Auto-pick via the shared helper so this badge and the A/B compare panel
  // use the same algorithm (single source of truth).
  const altLabel = useMemo(
    () => getAutoAltProfileLabel(profileLabel, profileCenter),
    [profileLabel, profileCenter],
  );

  const dismiss = () => {
    setDismissed(true);
    if (userId && typeof window !== 'undefined') {
      window.sessionStorage.setItem(SESSION_KEY_PREFIX + userId, '1');
    }
  };

  const onClick = () => {
    if (!altLabel) return;
    dismiss();
    navigate(`/dashboard/personalization?alt=${encodeURIComponent(altLabel)}`);
  };

  // False condition is the dominant case so the component returns null in
  // three situations:
  //   1. user not personalized yet (no profileLabel or center)
  //   2. no catalog profile differs enough (altLabel null)
  //   3. user dismissed this session (sessionStorage flag)
  if (!altLabel || dismissed) return null;

  return (
    <AnimatePresence>
      {/* Outer is a <div role="button">, NOT a <button>, so the dismiss
          control nested inside it stays well-formed HTML (HTML5 forbids
          nested interactive content). Keyboard activation is reproduced
          with onKeyDown so Enter/Space still triggers navigate. */}
      <motion.div
        key={altLabel}
        role="button"
        tabIndex={0}
        initial={{ opacity: 0, y: -4, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.96 }}
        transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        title={`Your current shape (${profileLabel}) has a sibling profile (${altLabel}) with a notably different center. Tap to preview.`}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-gradient-to-br from-[#7C3AED]/15 to-[#10B981]/15 border border-[#7C3AED]/40 text-[#F0EFFE] hover:border-[#7C3AED]/70 hover:from-[#7C3AED]/25 transition-all text-[11px] font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/40"
      >
        <Sparkles size={11} className="text-[#A78BFA]" />
        <span>Try {altLabel}</span>
        <ArrowRight size={10} className="text-[#9090A8]" />
        <button
          type="button"
          aria-label="Hide the live-compare suggestion for this session"
          // Stop propagation so the dismiss doesn't double-fire the navigate.
          onClick={(e) => { e.stopPropagation(); dismiss(); }}
          className="ml-0.5 text-[#7A7A96] hover:text-[#F0EFFE] flex items-center justify-center cursor-pointer"
        >
          <X size={10} aria-hidden="true" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
};

export default LiveCompareBadge;

/**
 * StreakBurst
 *
 * Drop-in viewport-only overlay that fires a celebration burst when
 * the user's streak crosses a milestone day (3 / 7 / 14 / 30 / 50 / 100 / 200 / 365).
 *
 * Usage:
 *   <StreakBurst trigger={streakDay} />     // auto-fires on prop change to a milestone value
 *
 * Behavior:
 *   - Listens for `trigger` changes. If the new value is in STREAK_MILESTONES, fire confetti.
 *   - Mounts no DOM by default. Renders a visually-hidden `role="status"` so screen reader
 *     users hear "X day streak unlocked". Respects prefers-reduced-motion.
 *   - Confetti fires WITHIN this component so canvas-confetti's auto-cleanup attaches to
 *     this component's lifecycle (avoids lingering canvas after route transitions).
 */
import React, { useEffect, useRef } from 'react';
import { useConfetti } from '../../hooks/useConfetti';
import { usePrefersReducedMotion } from '../../hooks/useReducedMotion';

export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365] as const;

interface StreakBurstProps {
  /** The current streak day count. Component fires on prop-change to a milestone. */
  trigger: number;
  /** Optional override for the headline announcement (defaults to "{n}-day streak unlocked") */
  message?: string;
}

const StreakBurst: React.FC<StreakBurstProps> = ({ trigger, message }) => {
  const reduced = usePrefersReducedMotion();
  const fire = useConfetti();
  const lastTriggeredRef = useRef<number>(0);
  const announceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!STREAK_MILESTONES.includes(trigger as any)) return;
    if (lastTriggeredRef.current === trigger) return; // dedupe — same prop twice
    lastTriggeredRef.current = trigger;

    if (!reduced) {
      // Twin-angle confetti from left and right with brand violet palette.
      fire({
        particleCount: 120,
        spread: 90,
        originY: 0.55,
        twin: true,
        scalar: 1.1,
      });
      // Follow-up burst 400ms later — gives a richer effect at no perf cost.
      const t = window.setTimeout(() => {
        fire({ particleCount: 60, spread: 110, originY: 0.4 });
      }, 400);
      return () => window.clearTimeout(t);
    }
    // Reduced motion: no canvas-confetti, just a screen-reader announcement.
  }, [trigger, reduced, fire]);

  // Always render a visually-hidden live region so the announcement is queued
  // when Tracked. No DOM mounted when reduced-motion is off and no trigger fired.
  const headline = message ?? `${trigger}-day streak unlocked`;

  return (
    <div
      ref={announceRef}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only absolute -left-[10000px] h-px w-px overflow-hidden"
    >
      {STREAK_MILESTONES.includes(trigger as any) && headline}
    </div>
  );
};

export default StreakBurst;

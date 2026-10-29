/**
 * TextEffect — character-by-character reveal (a faithful re-implementation
 * of React Bits' `<MagicText/>` using framer-motion, already installed).
 *
 * Accessibility: per-character motion spans are `aria-hidden` so screen
 * readers see only the wrapper's `aria-label={text}` (the full string).
 * Honors prefers-reduced-motion (renders text instantly, no animation).
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from './useReducedMotion';

export interface TextEffectProps {
  /** The text to reveal. New value re-triggers the animation. */
  text: string;
  /** Optional className forwarded to the wrapper. */
  className?: string;
  /** Delay between each character reveal (seconds). Default 0.03. */
  stagger?: number;
}

export function TextEffect({ text, className, stagger = 0.03 }: TextEffectProps) {
  const reduced = useReducedMotion();
  // Initial state computed from current reduced-motion preference so we
  // don't need a synchronous setState in the effect on first render.
  const [revealed, setRevealed] = useState<number>(() =>
    reduced ? text.length : 0,
  );
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Always clear a prior interval first — covers the (reduced: false→true)
    // mid-animation path AND text/stagger changes.
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (reduced) {
      // Jump-to-end animation choreography on a reduced:true mid-flight
      // transition. Same justification as below — this is the
      // choreography signal, not a cascading re-render.
       
      setRevealed(text.length);
      return;
    }
    // Animation choreography entry point — reset to 0 then tick up via the
    // interval. This IS a synchronous setState-in-effect, but it's the
    // "I am starting an animation" signal, not a cascading re-render.
     
    setRevealed(0);
    let i = 0;
    intervalRef.current = window.setInterval(() => {
      i += 1;
      setRevealed((prev) => Math.min(text.length, Math.max(prev, i)));
      if (i >= text.length && intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, Math.max(20, stagger * 1000));
    return () => {
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [text, stagger, reduced]);

  if (reduced) {
    return <span className={className}>{text}</span>;
  }

  return (
    <motion.span
      className={className}
      aria-label={text}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {Array.from(text).map((char, idx) => {
        const isRevealed = idx < revealed;
        return (
          <motion.span
            key={idx}
            aria-hidden="true"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: isRevealed ? 1 : 0, y: isRevealed ? 0 : 6 }}
            transition={{ duration: 0.18, delay: idx * stagger, ease: 'easeOut' }}
          >
            {char === ' ' ? '\u00A0' : char}
          </motion.span>
        );
      })}
    </motion.span>
  );
}

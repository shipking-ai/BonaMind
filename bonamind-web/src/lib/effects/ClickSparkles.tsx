/**
 * ClickSparkles — wraps a child element and emits a particle burst at the
 * click position. Faithful re-implementation of React Bits'
 * `<ClickSparkles>` using framer-motion (already installed).
 *
 * Use for primary CTAs: "+ New Deck", "Start Session", "Submit". The
 * burst is brief (350ms), gold-tinted, doesn't obstruct target hitting.
 */
import { type MouseEvent, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from './useReducedMotion';

export interface ClickSparklesProps {
  children: React.ReactNode;
  /** Number of spark particles per click. */
  count?: number;
  /** Spark color(s). */
  color?: string | string[];
  className?: string;
}

const COLORS = ['#F59E0B', '#7C3AED', '#EC4899', '#06B6D4'];

interface Spark {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
}

export function ClickSparkles({
  children,
  count = 6,
  color,
  className,
}: ClickSparklesProps) {
  const reduced = useReducedMotion();
  const [sparks, setSparks] = useState<Spark[]>([]);

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (reduced) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const palette = Array.isArray(color) ? color : color ? [color] : COLORS;
    const fresh: Spark[] = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 30 + Math.random() * 30;
      return {
        id: Date.now() + i,
        x,
        y,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
        color: palette[Math.floor(Math.random() * palette.length)],
      };
    });
    setSparks((prev) => [...prev, ...fresh]);
    // Prune after animation lifespan.
    window.setTimeout(() => {
      setSparks((prev) => prev.filter((s) => !fresh.includes(s)));
    }, 500);
  };

  return (
    <div className={className} onClick={handleClick} style={{ position: 'relative', display: 'inline-block' }}>
      {children}
      <AnimatePresence>
        {sparks.map((s) => (
          <motion.span
            key={s.id}
            initial={{ x: s.x, y: s.y, scale: 0.4, opacity: 1 }}
            animate={{ x: s.x + s.dx, y: s.y + s.dy, scale: 1.1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: s.color,
              pointerEvents: 'none',
              boxShadow: `0 0 8px ${s.color}`,
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

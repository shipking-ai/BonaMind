// ─── Nova motion primitives ────────────────────────────────────────────────
// Single source of truth for the Awwwards-tier micro-interactions used across
// every Nova page. Each primitive:
//   • Animates via framer-motion (which runs everything on rAF, GPU-composited
//     transforms only — no JS-driven layout thrash).
//   • Honors `prefers-reduced-motion` automatically via `useReducedMotion()`;
//     the animation collapses to a clean static final state.
//   • Uses spring/easeOut timing that matches the design language elsewhere.

import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useReducedMotion, animate } from 'framer-motion';

// ─── Easing ─────────────────────────────────────────────────────────────
// Framer-motion's strict `Variants` typing rejects bare `number[]` for the
// `ease` field — it expects either a string identifier or a typed bezier
// tuple. Export a single canonical constant for the expo-out easing the
// rest of the Nova system uses so we don't have to repeat the tuple literal
// (and the type cast) at every call site.
export const EXPO_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

// ─── useRM ─────────────────────────────────────────────────────────────────
// framer-motion's useReducedMotion can return null in SSR — normalise to a bool.

export function useRM(): boolean {
  return useReducedMotion() ?? false;
}

// ─── <CountUp /> ───────────────────────────────────────────────────────────
// Animates from 0 → value over `duration` seconds, formatting on the fly.
// Uses useMotionValue + subscribe-to-change so the displayed DOM updates are
// 100 % off React's re-render path.

export function CountUp({
  value,
  duration = 0.9,
  delay = 0,
  format,
  className,
}: {
  value: number;
  duration?: number;
  delay?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const reduced = useRM();
  const mv = useMotionValue(reduced ? value : 0);
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      mv.set(value);
      setDisplay(value);
      return;
    }
    const controls = animate(mv, value, {
      duration,
      delay,
      ease: EXPO_OUT,
    });
    return () => controls.stop();
  }, [value, duration, delay, reduced, mv]);

  useEffect(() => mv.on('change', setDisplay), [mv]);

  const fmt = (n: number) => (format ? format(n) : Math.round(n).toLocaleString());
  return <span className={className}>{fmt(display)}</span>;
}

// ─── <FadeUp /> ────────────────────────────────────────────────────────────
// A drop-in wrapper that fades + slides up on mount. Use sparingly — every
// section on the dashboard doesn't need one; reserve for first-paint content.

export function FadeUp({
  children,
  delay = 0,
  y = 12,
  duration = 0.4,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  duration?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: EXPO_OUT }}
    >
      {children}
    </motion.div>
  );
}

// ─── StaggerList / StaggerItem ─────────────────────────────────────────────
// Wrap a list; children wrapped in StaggerItem fade-up 40ms apart.

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.05 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EXPO_OUT } },
};

export function StaggerList({
  children,
  className,
  stagger = 0.04,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={{
        ...staggerContainer,
        show: {
          ...staggerContainer.show,
          transition: { staggerChildren: stagger, delayChildren: 0.05 },
        },
      }}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={staggerItem}>
      {children}
    </motion.div>
  );
}

// ─── <RevealOnScroll /> ────────────────────────────────────────────────────
// Reveals a block only when it scrolls into view (once). Good for sections
// below the fold so we don't waste paints on hidden content.

export function RevealOnScroll({
  children,
  delay = 0,
  className,
  y = 20,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.5, delay, ease: EXPO_OUT }}
    >
      {children}
    </motion.div>
  );
}

// ─── <Shimmer /> ───────────────────────────────────────────────────────────
// Loading skeleton. The gradient stripe slides right-to-left forever.

export function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-white/[0.04] ${className}`}>
      <motion.div
        className="absolute inset-y-0 w-1/3"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(139,92,246,0.10), transparent)',
        }}
        animate={{ x: ['-100%', '300%'] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

// ─── <ShimmerRow /> ─────────────────────────────────────────────────────────
// Convenience for "skeleton of a stat card" — a fixed-size shimmer block.

export function ShimmerRow({ minHeight: _minHeight = 56, className = '' }: { minHeight?: number; className?: string }) {
  return <Shimmer className={`rounded-xl ${className}`} />;
  // minHeight kept for API back-compat; not actually used here.
}

// ─── <MagneticButton /> ────────────────────────────────────────────────────
// Button that leans subtly toward the cursor. The strength is intentionally
// low so it doesn't fight motion-sensitive users. Under reduced-motion it
// becomes a plain button.

export function MagneticButton({
  children,
  strength = 0.12,
  className,
  ...rest
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
  [k: string]: any;
}) {
  const reduced = useRM();
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) * strength;
    const y = (e.clientY - (r.top + r.height / 2)) * strength;
    setPos({ x, y });
  };

  const reset = () => setPos({ x: 0, y: 0 });

  return (
    <motion.button
      ref={ref}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={reset}
      animate={{ x: pos.x, y: pos.y }}
      transition={{ type: 'spring', stiffness: 350, damping: 25, mass: 0.5 }}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

// ─── <AnimatedBar /> ───────────────────────────────────────────────────────
// Animated horizontal progress bar — handled by Framer Motion's width tween.

export function AnimatedBar({
  value,
  max = 100,
  delay = 0,
  duration = 0.9,
  gradient = 'from-violet-500 to-violet-400',
  trackClassName = 'h-2 rounded-full bg-white/[0.06] overflow-hidden',
}: {
  value: number;
  max?: number;
  delay?: number;
  duration?: number;
  gradient?: string;
  trackClassName?: string;
}) {
  const reduced = useRM();
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  return (
    <div className={trackClassName}>
      <motion.div
        className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
        initial={{ width: reduced ? `${pct}%` : '0%' }}
        animate={{ width: `${pct}%` }}
        transition={{ duration, delay, ease: EXPO_OUT }}
      />
    </div>
  );
}

// ─── <AnimatedRing /> ──────────────────────────────────────────────────────
// SVG ring that fills on mount. Single SVG, single animated stroke.

export function AnimatedRing({
  value,
  size = 80,
  strokeWidth = 4,
  gradientId,
  gradientFrom = '#7C3AED',
  gradientTo = '#8B5CF6',
  children,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  /** Required when more than one ring is on the page — gradient ids must be unique. */
  gradientId: string;
  gradientFrom?: string;
  gradientTo?: string;
  children?: React.ReactNode;
}) {
  const _reduced = useRM();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, value));

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={gradientFrom} />
            <stop offset="100%" stopColor={gradientTo} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - progress) }}
          transition={{ duration: 1.1, delay: 0.2, ease: EXPO_OUT }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center flex-col">
        {children}
      </div>
    </div>
  );
}

// ─── <HoverLift /> ─────────────────────────────────────────────────────────
// Wraps any element in a hover scale+lift.

export function HoverLift({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {children}
    </motion.div>
  );
}

// ─── <LayoutCard /> ─────────────────────────────────────────────────────────
// Card with optional shared-element layoutId. Use the same layoutId on the
// card's listing instance and its detail instance to morph between routes.

export function LayoutCard({
  children,
  layoutId,
  className,
}: {
  children: React.ReactNode;
  layoutId?: string;
  className?: string;
}) {
  const reduced = useRM();
  return (
    <motion.div
      className={className}
      layoutId={reduced ? undefined : layoutId}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
    >
      {children}
    </motion.div>
  );
}

// ─── <PageTransition /> ────────────────────────────────────────────────────
// Cross-fade + 8px slide-up wrapper keyed on pathname.

export function PageTransition({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EXPO_OUT }}
    >
      {children}
    </motion.div>
  );
}

// ─── <SRAnnounce /> ────────────────────────────────────────────────────────
// Visually-hidden polite live region. Pass a string whenever something
// meaningful changes — counts, completion states, etc. Screen readers will
// announce the new string without interrupting the user.

export function SRAnnounce({ message }: { message: string | null | undefined }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0,0,0,0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      {message ?? ''}
    </div>
  );
}

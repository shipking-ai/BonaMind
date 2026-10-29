// ─── NovaCharts ─────────────────────────────────────────────────────────────
// Animated SVG chart primitives — the visual heart of the doc-aligned
// dashboard. Each primitive:
//   • Animates via framer-motion; uses only GPU-composited transforms + SVG
//     path attributes (no JS-driven layout thrash).
//   • Honors `prefers-reduced-motion` (skips animation, renders final state).
//   • Has a unique `gradientId` prop you supply when more than one instance
//     of the same primitive mounts on a page (otherwise SVG <defs> collide).
//
// Implements the doc's "animated data build-out" pattern — bars grow from
// baseline, lines stroke-draw on, heatmap cells appear in sequence. Reveals
// information rather than decorate it.

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { EXPO_OUT } from './motion';

export function useRM2(): boolean {
  return useReducedMotion() ?? false;
}

// ─── <AnimatedLine /> ────────────────────────────────────────────────────────
// Single SVG path stroked onto the canvas with stroke-dasharray art. The path
// data is an array of `[x, y]` points; we poly-line them. The stroke draws
// from left to right on mount.

export function AnimatedLine({
  points,
  width = 240,
  height = 80,
  padding = 4,
  gradientId,
  gradientFrom = '#7C3AED',
  gradientTo = '#3B82F6',
  strokeWidth = 2,
  baseline = false,
  ariaLabel,
}: {
  points: Array<[number, number]>;
  width?: number;
  height?: number;
  padding?: number;
  /** Required when more than one chart of the same kind lives on the page. */
  gradientId: string;
  gradientFrom?: string;
  gradientTo?: string;
  strokeWidth?: number;
  baseline?: boolean;
  ariaLabel?: string;
}) {
  const reduced = useRM2();

  const { pathD, baselineD, xMax: _xMax, yMin: _yMin, yMax: _yMax } = useMemo(() => {
    if (points.length === 0) {
      return { pathD: '', baselineD: '', xMax: 1, yMin: 0, yMax: 1 };
    }
    const xs = points.map(p => p[0]);
    const ys = points.map(p => p[1]);
    const xMax = Math.max(...xs, 1);
    const yMin = Math.min(...ys, 0);
    const yMax = Math.max(...ys, 1);
    const innerW = width - padding * 2;
    const innerH = height - padding * 2;
    const spanX = xMax - (xs.length > 1 ? Math.min(...xs) : 0) || 1;
    const spanY = yMax - yMin || 1;
    const dPts = points.map(([x, y]) => {
      const px = padding + ((x - (xs.length > 1 ? Math.min(...xs) : 0)) / spanX) * innerW;
      const py = padding + innerH - ((y - yMin) / spanY) * innerH;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    });
    return {
      pathD: 'M ' + dPts.join(' L '),
      baselineD: `M ${padding},${padding + innerH} L ${padding + innerW},${padding + innerH}`,
      xMax,
      yMin,
      yMax,
    };
  }, [points, width, height, padding]);

  const pathRef = useRef<SVGPathElement | null>(null);
  const [_length, setLength] = useState(0);
  useEffect(() => {
    if (!pathRef.current) return;
    const len = pathRef.current.getTotalLength();
    setLength(len);
  }, [pathD]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={ariaLabel ?? 'Animated line chart'}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={gradientFrom} />
          <stop offset="100%" stopColor={gradientTo} />
        </linearGradient>
      </defs>
      {baseline && (
        <motion.path
          d={baselineD}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
          fill="none"
          initial={{ pathLength: reduced ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, ease: EXPO_OUT }}
        />
      )}
      <motion.path
        ref={pathRef}
        d={pathD}
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={{ pathLength: reduced ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: EXPO_OUT }}
      />
    </svg>
  );
}

// ─── <AnimatedBar /> ─────────────────────────────────────────────────────────
// Single animated bar (used by other primitives; the dashboard uses the more
// specific <VerticalBars/> primitive below for grouped bar charts).

export function AnimatedBar({
  value,
  max = 100,
  width = 24,
  height = 80,
  gradientId,
  gradientFrom = '#7C3AED',
  gradientTo = '#8B5CF6',
  rounded = 4,
  delay = 0,
  duration = 0.9,
}: {
  value: number;
  max?: number;
  width?: number;
  height?: number;
  gradientId: string;
  gradientFrom?: string;
  gradientTo?: string;
  rounded?: number;
  /** Stagger partner index for grid bars. */
  delay?: number;
  duration?: number;
}) {
  const reduced = useRM2();
  const pct = Math.min(Math.max(value / max, 0), 1);
  const barH = height * pct;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor={gradientFrom} stopOpacity="0.7" />
          <stop offset="100%" stopColor={gradientTo} stopOpacity="1" />
        </linearGradient>
      </defs>
      {/* Track */}
      <rect x={0} y={0} width={width} height={height} rx={rounded} ry={rounded} fill="rgba(255,255,255,0.04)" />
      {/* Animated fill */}
      <motion.rect
        x={0}
        y={height - barH}
        width={width}
        height={barH}
        rx={rounded}
        ry={rounded}
        fill={`url(#${gradientId})`}
        initial={{ height: reduced ? barH : 0, y: reduced ? height - barH : height }}
        animate={{ height: barH, y: height - barH }}
        transition={{ duration: reduced ? 0 : duration, delay: reduced ? 0 : delay, ease: EXPO_OUT }}
      />
    </svg>
  );
}

// ─── <AnimatedSparkline /> ───────────────────────────────────────────────────
// Inline 1-line chart for stat cards. Tight 60×24 footprint by default.

export function AnimatedSparkline({
  points,
  gradientFrom = '#8B5CF6',
  gradientTo = '#3B82F6',
  width = 60,
  height = 24,
  delay: _delay = 0,
}: {
  points: Array<[number, number]>;
  width?: number;
  height?: number;
  gradientFrom?: string;
  gradientTo?: string;
  delay?: number;
}) {
  const gid = useId().replace(/:/g, '-');
  return (
    <span aria-hidden style={{ width, height }} className="inline-block align-middle">
      <AnimatedLine
        points={points}
        width={width}
        height={height}
        padding={2}
        gradientId={`spark-${gid}`}
        gradientFrom={gradientFrom}
        gradientTo={gradientTo}
        strokeWidth={1.6}
      />
    </span>
  );
}

// ─── <AnimatedRadial /> ──────────────────────────────────────────────────────
// Circular progress arc with gradient stroke. Use for retention rings,
// difficulty ratings, etc.

export function AnimatedRadial({
  value,
  size = 96,
  strokeWidth = 6,
  gradientFrom = '#7C3AED',
  gradientTo = '#C026D3',
  gradientId,
  trackOpacity = 0.08,
  children,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  gradientFrom?: string;
  gradientTo?: string;
  gradientId: string;
  trackOpacity?: number;
  children?: ReactNode;
}) {
  const _reduced = useRM2();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, value));

  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`Progress ${Math.round(progress * 100)} percent`}>
      <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={gradientFrom} />
            <stop offset="100%" stopColor={gradientTo} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeOpacity={trackOpacity === 0.06 ? 1 : trackOpacity} strokeWidth={strokeWidth} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={`url(#${gradientId})`} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - progress) }}
          transition={{ duration: 1.2, ease: EXPO_OUT }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center flex-col">
        {children}
      </div>
    </div>
  );
}

// ─── <AnimatedHeatmap /> ─────────────────────────────────────────────────────
// One-row-per-day study activity heatmap grid. Cells stagger in on mount via
// CSS animation (single keyframe in index.css), NOT framer-motion — keeps a
// 140-cell grid to zero JS subscriptions.

export function AnimatedHeatmap({
  days,
  cellSize = 6,
  gap = 2,
  weeksPerRow: _weeksPerRow = 7,
  intensityColor = (i: number) => `rgba(139, 92, 246, ${0.15 + i * 0.7})`,
  emptyColor = 'rgba(255,255,255,0.04)',
  baseDelay = 0.35,
  perCell = 0.0025,
  role = 'img',
  ariaLabel = 'Study activity heatmap',
}: {
  days: Array<{ key: string; intensity: number }>;
  cellSize?: number;
  gap?: number;
  weeksPerRow?: number;
  intensityColor?: (i: number) => string;
  emptyColor?: string;
  baseDelay?: number;
  perCell?: number;
  role?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className="flex flex-wrap"
      style={{ gap }}
      role={role}
      aria-label={ariaLabel}
    >
      {days.map((day, i) => {
        const intensity = Math.min(Math.max(day.intensity, 0), 1);
        const bg = intensity === 0 ? emptyColor : intensityColor(intensity);
        return (
          <div
            key={day.key}
            className="rounded-sm nova-cell-fade"
            title={`${day.key}: ${Math.round(intensity * 100)}%`}
            style={{
              width: cellSize,
              height: cellSize,
              background: bg,
              animationDelay: `${baseDelay + i * perCell}s`,
            }}
          />
        );
      })}
    </div>
  );
}

// ─── <AnimatedGroup /> ───────────────────────────────────────────────────────
// Fade-up group with shared layoutId plumbing so cross-page "deck card" or
// "achievement card" can morph from the listing into the detail view.

export function AnimatedGroup({
  children,
  layoutId,
  className,
}: {
  children: ReactNode;
  layoutId?: string;
  className?: string;
}) {
  const reduced = useRM2();
  return (
    <motion.div
      className={className}
      layoutId={reduced ? undefined : layoutId}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EXPO_OUT }}
    >
      {children}
    </motion.div>
  );
}

// ─── <SalesAreaChart /> ──────────────────────────────────────────────────────
// For the "Sales overview" row. A smooth-curve area chart with cyan→violet
// gradient under the line, animated path-draw on mount, optional grid lines
// and x-axis tick labels rendered as SVG `<text>` elements. Designed to read
// as the centerpiece metric on the overview page without dragging in a heavy
// charting library.

export interface SalesPoint {
  /** Display label rendered at the x-axis tick (e.g. "May"). */
  label: string;
  /** Numeric value plotted on the y-axis. */
  value: number;
}

export function SalesAreaChart({
  points,
  width = 720,
  height = 220,
  paddingLeft = 36,
  paddingRight = 16,
  paddingTop = 24,
  paddingBottom = 28,
  gradientId,
  showGrid = true,
  showLabels = true,
  showBadge,
  legend,
  ariaLabel = 'Sales overview area chart',
}: {
  points: SalesPoint[];
  width?: number;
  height?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  /** Required when more than one area chart lives on the same page. */
  gradientId: string;
  showGrid?: boolean;
  showLabels?: boolean;
  showBadge?: string;
  legend?: string;
  ariaLabel?: string;
}) {
  const reduced = useRM2();

  const { pathD, areaD, ticks, gridLines, yMax } = useMemo(() => {
    if (points.length === 0) {
      return { pathD: '', areaD: '', ticks: [], gridLines: [], yMax: 1 };
    }
    const values = points.map(p => p.value);
    const yMax = Math.max(1, ...values);
    const innerW = width - paddingLeft - paddingRight;
    const innerH = height - paddingTop - paddingBottom;
    const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;

    const coords = points.map((p, i) => {
      const x = paddingLeft + i * stepX;
      // Cubic-bezier smoothing — standard Catmull-Rom → Bezier conversion
      // so the curve reads as a single flowing wave rather than a poly-line.
      const y = paddingTop + innerH - (p.value / yMax) * innerH;
      return { x, y };
    });

    let d = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i - 1] ?? coords[i];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[i + 2] ?? p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    const areaD = `${d} L ${coords[coords.length - 1].x.toFixed(1)},${(paddingTop + innerH).toFixed(1)} L ${coords[0].x.toFixed(1)},${(paddingTop + innerH).toFixed(1)} Z`;

    const tickStep = Math.ceil(points.length / Math.max(1, Math.floor(innerW / 80)));
    const labelTicks = points
      .map((p, i) => ({ label: p.label, x: coords[i].x }))
      .filter((_, i) => i % tickStep === 0);

    const gridStepY = yMax / 4;
    const lines = Array.from({ length: 4 }, (_, i) => ({
      y: paddingTop + innerH - ((i + 1) / 5) * innerH,
      value: Math.round((i + 1) * gridStepY),
    }));

    return { pathD: d, areaD, ticks: labelTicks, gridLines: lines, yMax };
  }, [points, width, height, paddingLeft, paddingRight, paddingTop, paddingBottom]);

  const pathRef = useRef<SVGPathElement | null>(null);

  return (
    <div className="relative w-full" style={{ height }}>
      {showBadge && (
        <div className="absolute top-0 right-0 px-2.5 py-1 rounded-full bg-cyan-400/15 text-cyan-200 text-[10px] font-bold tabular-nums tracking-wide border border-cyan-400/20">
          {showBadge}
        </div>
      )}
      {legend && (
        <div className="absolute top-0 left-0 flex items-center gap-2 text-[10px] font-semibold text-zinc-300">
          <span className="inline-block w-2 h-2 rounded-full bg-cyan-400" aria-hidden /> {legend}
        </div>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`${gradientId}-fill`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#22D3EE" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>

        {showGrid && gridLines.map((g, i) => (
          <line
            key={i}
            x1={paddingLeft}
            y1={g.y}
            x2={width - paddingRight}
            y2={g.y}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        ))}

        {showGrid && gridLines.map((g, i) => (
          <text
            key={`l${i}`}
            x={paddingLeft - 8}
            y={g.y + 3}
            textAnchor="end"
            fontSize={9}
            fontWeight={500}
            fill="rgba(255,255,255,0.35)"
          >
            {g.value}
          </text>
        ))}

        <motion.path
          d={areaD}
          fill={`url(#${gradientId}-fill)`}
          initial={{ opacity: reduced ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.3, ease: EXPO_OUT }}
        />

        <motion.path
          ref={pathRef}
          d={pathD}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: reduced ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, ease: EXPO_OUT }}
        />

        {points.length > 0 && points.map((p, i) => {
          const innerW = width - paddingLeft - paddingRight;
          const innerH = height - paddingTop - paddingBottom;
          const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
          const x = paddingLeft + i * stepX;
          const y = paddingTop + innerH - (p.value / yMax) * innerH;
          return (
            <motion.circle
              key={i}
              cx={x}
              cy={y}
              r={3.5}
              fill="#22D3EE"
              stroke="#0E1A2E"
              strokeWidth={2}
              initial={{ scale: reduced ? 1 : 0, opacity: reduced ? 1 : 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: reduced ? 0 : 0.4 + i * 0.04, duration: 0.3, ease: EXPO_OUT }}
            />
          );
        })}

        {showLabels && ticks.map((t, i) => (
          <text
            key={`t${i}`}
            x={t.x}
            y={height - 8}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            fill="rgba(255,255,255,0.45)"
          >
            {t.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─── <VerticalBars /> ────────────────────────────────────────────────────────
// Grouped vertical-bar chart for the Active Users row. Each bar gets a
// distinct gradient so the grid reads as a color-coded histogram rather than
// a monochrome plot.

export interface VerticalBarDatum {
  label: string;
  /** Top-line numeric value (rendered below the bar in `.tabular-nums`). */
  value: number;
  /** Optional small unit suffix ("$", "m", "%" etc). */
  unit?: string;
  /** Bar height as a 0..1 fraction of chart height. */
  magnitude: number;
  /** One of the four nova-chip palette colors. */
  color: 'violet' | 'cyan' | 'fuchsia' | 'amber' | 'emerald' | 'rose';
}

const CHART_FILLS: Record<VerticalBarDatum['color'], { from: string; to: string }> = {
  violet:  { from: '#A78BFA', to: '#7C3AED' },
  cyan:    { from: '#67E8F9', to: '#06B6D4' },
  fuchsia: { from: '#F0ABFC', to: '#D946EF' },
  amber:   { from: '#FCD34D', to: '#F59E0B' },
  emerald: { from: '#6EE7B7', to: '#10B981' },
  rose:    { from: '#FDA4AF', to: '#F43F5E' },
};

export function VerticalBars({
  bars,
  height = 160,
  gap = 12,
  gradientId,
  ariaLabel = 'Active users bar chart',
}: {
  bars: VerticalBarDatum[];
  height?: number;
  gap?: number;
  gradientId: string;
  ariaLabel?: string;
}) {
  const reduced = useRM2();
  const maxMagnitude = Math.max(0.001, ...bars.map(b => b.magnitude));
  return (
    <div
      className="flex items-end w-full"
      style={{ height, gap }}
      role="img"
      aria-label={ariaLabel}
    >
      {bars.map((b, i) => {
        const fill = CHART_FILLS[b.color];
        const barH = (b.magnitude / maxMagnitude) * (height - 24);
        const id = `${gradientId}-${i}`;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-2">
            <svg
              viewBox={`0 0 32 100`}
              width="100%"
              height={barH}
              preserveAspectRatio="none"
              aria-hidden
            >
              <defs>
                <linearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={fill.from} />
                  <stop offset="100%" stopColor={fill.to} />
                </linearGradient>
              </defs>
              <motion.rect
                x={0}
                y={0}
                width={32}
                height={100}
                rx={4}
                ry={4}
                fill={`url(#${id})`}
                initial={{ scaleY: reduced ? 1 : 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: reduced ? 0 : 0.1 + i * 0.05, duration: 0.55, ease: EXPO_OUT }}
                style={{ transformOrigin: 'bottom' }}
              />
            </svg>
            <div className="text-[10px] font-bold text-white tabular-nums leading-none">{b.value}{b.unit ?? ''}</div>
            <div className="text-[9px] font-medium text-zinc-500 leading-none truncate max-w-[60px]">{b.label}</div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * AreaChart + LineChart — minimal, bklit-compatible wrappers around
 * `recharts` (already in the project). Exposes a small, stable API
 * (`data`, `index`, `categories`, `colors`, `valueFormatter`) so the
 * surface area we depend on is narrow enough to swap to the upstream
 * bklit client later via shadcn CLI without rewriting callers.
 *
 * Why hand-roll instead of `npx shadcn add @bklit/area-chart`:
 *   - bklit uses Visx primitives — heavier than recharts and a brand-new
 *     dependency class to debug if anything goes sideways.
 *   - recharts is already a running dependency in the project
 *     (chart mounts in `useScrollAnimation.tsx`, etc.). We unify on what
 *     we have.
 *   - Component-level a11y + motion policy (reduced motion renders the
 *     static fallback) is owned here.
 *
 * Honors prefers-reduced-motion: animations are gated to plain paths,
 * so users with reduced motion see the chart in its final state.
 */
// forwardRef + ref as any were unbounded YAGNI; no consumer in the
// codebase reads AreaChart/LineChart's ref. Drop the forwarded ref
// and use plain function components so the recharts internals never
// leak into our type contract.
import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useReducedMotion } from './useReducedMotion';

export interface ChartSeries {
  /** Key into each `data` object. */
  dataKey: string;
  label?: string;
  color?: string;
}

export interface AreaChartProps {
  /** Each object is one point. `index` field becomes the X value. */
  data: Array<Record<string, number | string | Date>>;
  /** X-axis field name in `data` items. */
  index?: string;
  /** Categories / series to draw. */
  categories: ChartSeries[];
  /** Tailwind-3 / CSS-var style color preset. */
  colors?: string[];
  /** Format Y values in tooltips + axes. */
  valueFormatter?: (v: number) => string;
  /** Show the gradient edge. Default true. */
  showGradient?: boolean;
  /** Pixel height. Default 240. */
  height?: number;
  className?: string;
}

const DEFAULT_COLORS = ['#7C3AED', '#EC4899', '#06B6D4'];

export function AreaChart(props: AreaChartProps) {
  const reduced = useReducedMotion();
  const {
    data,
    index = 'date',
    categories,
    colors = DEFAULT_COLORS,
    valueFormatter = (v) => String(v),
    showGradient = true,
    height = 240,
    className,
  } = props;

  return (
    <ResponsiveContainer width="100%" height={height} className={className}>
      <RechartsAreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          {categories.map((cat, i) => {
            const color = colors[i % colors.length];
            if (!showGradient) return null;
            return (
              <linearGradient
                key={cat.dataKey}
                id={`grad-${cat.dataKey}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
        <XAxis
          dataKey={index}
          stroke="currentColor"
          strokeOpacity={0.4}
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="currentColor"
          strokeOpacity={0.4}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => valueFormatter(v)}
          width={40}
        />
        <Tooltip
          isAnimationActive={!reduced}
          cursor={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
          contentStyle={{
            background: 'rgba(17,17,24,0.95)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            fontSize: 12,
            color: '#F0EFFE',
          }}
          formatter={(v) => valueFormatter(Number(v))}
        />
        {categories.map((cat, i) => {
          const color = colors[i % colors.length];
          return (
            <Area
              key={cat.dataKey}
              type="monotone"
              dataKey={cat.dataKey}
              stroke={color}
              strokeWidth={2}
              fill={showGradient ? `url(#grad-${cat.dataKey})` : color}
              fillOpacity={showGradient ? 1 : 0.15}
              isAnimationActive={!reduced}
              name={cat.label ?? cat.dataKey}
            />
          );
        })}
      </RechartsAreaChart>
    </ResponsiveContainer>
  );
}

export interface LineChartProps {
  data: Array<Record<string, number | string | Date>>;
  index?: string;
  categories: ChartSeries[];
  colors?: string[];
  valueFormatter?: (v: number) => string;
  height?: number;
  className?: string;
}

export function LineChart(props: LineChartProps) {
  const reduced = useReducedMotion();
  const {
    data,
    index = 'date',
    categories,
    colors = DEFAULT_COLORS,
    valueFormatter = (v) => String(v),
    height = 240,
    className,
  } = props;

  return (
    <ResponsiveContainer width="100%" height={height} className={className}>
      <RechartsLineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
        <XAxis
          dataKey={index}
          stroke="currentColor"
          strokeOpacity={0.4}
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="currentColor"
          strokeOpacity={0.4}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => valueFormatter(v)}
          width={40}
        />
        <Tooltip
          isAnimationActive={!reduced}
          cursor={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
          contentStyle={{
            background: 'rgba(17,17,24,0.95)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            fontSize: 12,
            color: '#F0EFFE',
          }}
          formatter={(v) => valueFormatter(Number(v))}
        />
        {categories.map((cat, i) => {
          const color = colors[i % colors.length];
          return (
            <Line
              key={cat.dataKey}
              type="monotone"
              dataKey={cat.dataKey}
              stroke={color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={!reduced}
              name={cat.label ?? cat.dataKey}
            />
          );
        })}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}

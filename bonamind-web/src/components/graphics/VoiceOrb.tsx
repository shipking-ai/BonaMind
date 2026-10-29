import '../../styles/graphics.css';

/**
 * VoiceOrb — the single visual for the hands-free study loop.
 *
 * Construction: a 96×96 grid, one 2px ring at r=36 centred on (48,48).
 * Every glyph inside sits within a 40×40 safe area so states can swap
 * without the silhouette jumping.
 *
 * The five states map 1:1 onto useVoiceStudy's real states, so this is a
 * readout of the engine rather than decoration:
 *
 *   idle      mic glyph, resting pulse on the ring
 *   speaking  emission arcs travelling outward from the orb
 *   listening bars scaled by live mic amplitude (see `level`)
 *   thinking  one arc sweeping the ring while the answer is graded
 *   blocked   mic with a strike-through; the ring goes flat
 *
 * `level` is the actual normalised amplitude (0..1). Nothing here invents
 * movement: when the room is silent the bars sit at their floor.
 */

export type VoiceOrbState = 'idle' | 'speaking' | 'listening' | 'thinking' | 'blocked';

export interface VoiceOrbProps {
  state: VoiceOrbState;
  /** Normalised mic amplitude, 0..1. Only read while listening. */
  level?: number;
  size?: number;
  className?: string;
  /** Overrides the generated label when the parent already announces state. */
  label?: string;
}

const RING_R = 36;
/** 2πr for the sweep dash maths, rounded to the value used in graphics.css. */
const RING_C = 226;

/** Bar x-positions on the 96 grid — 5 bars, 8px pitch, centred on 48. */
const BARS = [32, 40, 48, 56, 64];
/** Per-bar weighting so the centre reacts most, like a real level meter. */
const BAR_WEIGHT = [0.55, 0.82, 1, 0.82, 0.55];
const BAR_FLOOR = 0.18;

const STATE_LABEL: Record<VoiceOrbState, string> = {
  idle: 'Voice ready',
  speaking: 'Speaking the question',
  listening: 'Listening for your answer',
  thinking: 'Checking your answer',
  blocked: 'Microphone blocked',
};

export function VoiceOrb({ state, level = 0, size = 96, className, label }: VoiceOrbProps) {
  const clamped = Math.max(0, Math.min(1, level));

  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={label ?? STATE_LABEL[state]}
      fill="none"
    >
      {/* Emission arcs sit behind the ring so they read as leaving it. */}
      {state === 'speaking' && (
        <g stroke="currentColor" strokeWidth={2} opacity={0.9}>
          <circle className="am-emit" cx={48} cy={48} r={RING_R} />
          <circle className="am-emit am-emit-2" cx={48} cy={48} r={RING_R} />
          <circle className="am-emit am-emit-3" cx={48} cy={48} r={RING_R} />
        </g>
      )}

      {/* The ring. Dimmed when blocked so the strike reads as the subject. */}
      <circle
        cx={48}
        cy={48}
        r={RING_R}
        stroke="currentColor"
        strokeWidth={2}
        opacity={state === 'blocked' ? 0.25 : 0.35}
        className={state === 'idle' ? 'am-rest' : undefined}
      />

      {state === 'thinking' && (
        <circle
          cx={48}
          cy={48}
          r={RING_R}
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={`${RING_C * 0.28} ${RING_C}`}
          className="am-sweep"
        />
      )}

      {state === 'listening' ? (
        <g stroke="currentColor" strokeWidth={4} strokeLinecap="round">
          {BARS.map((x, i) => (
            <line
              key={x}
              x1={x}
              y1={32}
              x2={x}
              y2={64}
              className="am-bar"
              style={
                {
                  '--am-level': BAR_FLOOR + clamped * BAR_WEIGHT[i] * (1 - BAR_FLOOR),
                } as React.CSSProperties
              }
            />
          ))}
        </g>
      ) : (
        <MicGlyph struck={state === 'blocked'} />
      )}
    </svg>
  );
}

/** Mic on the same 96 grid: capsule body, cradle arc, stem. */
function MicGlyph({ struck }: { struck: boolean }) {
  return (
    <g
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={struck ? 0.45 : 1}
    >
      <rect x={41} y={28} width={14} height={24} rx={7} />
      <path d="M34 46a14 14 0 0 0 28 0" />
      <path d="M48 60v8" />
      {struck && <path d="M32 30 64 66" strokeWidth={3.5} />}
    </g>
  );
}

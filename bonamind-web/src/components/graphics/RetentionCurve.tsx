/**
 * RetentionCurve — FSRS's forgetting curve, drawn from the real formula.
 *
 * This is the one graphic in the set that is a chart rather than an
 * illustration. It plots R(t) = (1 + t/S)^-1 — the same expression as
 * `forgettingCurve` in services/study/fsrs.ts — so the picture cannot
 * drift from the scheduler's actual behaviour.
 *
 * The point it makes: memory decays, a review resets stability, and the
 * next decay is shallower. That is the whole argument for FSRS over
 * fixed intervals, and it is worth showing rather than asserting.
 *
 * 200×96 grid. Time runs left to right; retrievability 0..1 bottom to top.
 */

const W = 200;
const H = 96;
const PAD_B = 14;
const PAD_T = 8;

/** Same shape as fsrs.ts forgettingCurve, inlined to keep this leaf-level. */
function retrievability(elapsed: number, stability: number): number {
  return 1 / (1 + elapsed / stability);
}

/** Samples one decay segment into an SVG path. */
function segment(x0: number, x1: number, stability: number, samples = 24): string {
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = x0 + (x1 - x0) * t;
    // Elapsed is expressed in the same units as stability so the curve
    // shape is scale-free; only the ratio matters visually.
    const r = retrievability(t * 2.2, stability);
    const y = PAD_T + (1 - r) * (H - PAD_T - PAD_B);
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

export function RetentionCurve({
  size = 200,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // Two decays either side of a review. The second uses a higher
  // stability, which is exactly what a successful review does to the card.
  const first = segment(10, 92, 1.0);
  const second = segment(100, 190, 2.6);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={size}
      height={(size * H) / W}
      className={className}
      fill="none"
      role="img"
      aria-label="Retention decays between reviews, and each review makes the next decay slower"
    >
      {/* Baseline = fully forgotten. */}
      <path
        d={`M6 ${H - PAD_B}h188`}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        opacity={0.3}
      />

      {/* Target-retention guide at R = 0.9, the FSRS default. */}
      <path
        d={`M6 ${(PAD_T + 0.1 * (H - PAD_T - PAD_B)).toFixed(1)}h188`}
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray="2 5"
        opacity={0.28}
      />

      <path d={first} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
      <path d={second} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />

      {/* The review itself: a vertical recovery, drawn lighter because the
          jump is instantaneous and shouldn't read as time passing. */}
      <path
        d={`M96 ${(PAD_T + (1 - retrievability(2.2, 1.0)) * (H - PAD_T - PAD_B)).toFixed(1)} L96 ${PAD_T}`}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="3 4"
        opacity={0.6}
      />
      <circle cx={96} cy={PAD_T} r={3.5} fill="currentColor" />
    </svg>
  );
}

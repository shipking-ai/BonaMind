/**
 * NoResultsArt — a search or filter matched nothing.
 *
 * Distinct from NoDecksArt on purpose: content exists, the query just
 * missed. The drawing keeps two real cards visible behind the lens so the
 * user reads "narrow your search", not "you have nothing".
 *
 * 160×120 grid.
 */
export function NoResultsArt({ size = 160, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      width={size}
      height={(size * 120) / 160}
      className={className}
      fill="none"
      role="img"
      aria-label="No matches for this search"
    >
      {/* Content that exists but didn't match — present, de-emphasised. */}
      <g stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" opacity={0.22}>
        <rect x={18} y={30} width={46} height={34} rx={6} />
        <rect x={100} y={62} width={46} height={34} rx={6} />
      </g>

      {/* Lens. Drawn at full strength — it is the subject. */}
      <circle cx={80} cy={56} r={26} stroke="currentColor" strokeWidth={2.5} />
      <path
        d="M99 75 116 92"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
      />

      {/* Empty interior: a single flat line rather than a cross. A cross
          reads as "error"; a flat line reads as "nothing found here". */}
      <path
        d="M69 56h22"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.5}
      />
    </svg>
  );
}

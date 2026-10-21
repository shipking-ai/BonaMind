/**
 * NotFoundArt — route matched nothing.
 *
 * Uses the card as the unit of navigation, because in this app a URL
 * almost always resolves to a deck or a card. A gap in an otherwise
 * ordered row says "this address pointed between two real things" far
 * more precisely than a large 404 numeral.
 *
 * 160×120 grid.
 */
export function NotFoundArt({ size = 160, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      width={size}
      height={(size * 120) / 160}
      className={className}
      fill="none"
      role="img"
      aria-label="This page could not be found"
    >
      {/* Two real neighbours. */}
      <g stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
        <rect x={14} y={38} width={42} height={44} rx={6} opacity={0.45} />
        <rect x={104} y={38} width={42} height={44} rx={6} opacity={0.45} />
      </g>
      <g stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.3}>
        <path d="M22 52h26M22 60h18" />
        <path d="M112 52h26M112 60h18" />
      </g>

      {/* The gap. Dashed outline, nothing inside — the slot exists in the
          sequence but holds no content. */}
      <rect
        x={62}
        y={34}
        width={36}
        height={52}
        rx={6}
        stroke="currentColor"
        strokeWidth={2}
        strokeDasharray="5 5"
        opacity={0.8}
      />
      <path
        d="M74 60h12"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.55}
      />

      {/* Ordering marks beneath, with the middle one missing. */}
      <g fill="currentColor" opacity={0.35}>
        <circle cx={35} cy={96} r={2.5} />
        <circle cx={125} cy={96} r={2.5} />
      </g>
      <circle cx={80} cy={96} r={2.5} stroke="currentColor" strokeWidth={1.5} opacity={0.35} />
    </svg>
  );
}

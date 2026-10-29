/**
 * GenericErrorArt — the ErrorBoundary fallback.
 *
 * Shown when something threw and we do not know what. The honest visual
 * for that is an interrupted process, not a broken object: a card whose
 * content stops partway, with the remainder unresolved. It implies "this
 * did not finish" rather than "your data is damaged", which is almost
 * always the truth and is far less alarming.
 *
 * 160×120 grid.
 */
export function GenericErrorArt({ size = 160, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      width={size}
      height={(size * 120) / 160}
      className={className}
      fill="none"
      role="img"
      aria-label="Something went wrong loading this view"
    >
      <rect
        x={38}
        y={26}
        width={84}
        height={68}
        rx={8}
        stroke="currentColor"
        strokeWidth={2}
        opacity={0.6}
      />

      {/* Content that rendered. */}
      <g stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.5}>
        <path d="M50 44h44" />
        <path d="M50 56h30" />
      </g>

      {/* Content that didn't — same rhythm, dashed and fading. */}
      <g
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray="4 6"
        opacity={0.28}
      >
        <path d="M50 68h40" />
        <path d="M50 80h22" />
      </g>

      {/* Interrupt mark on the card edge, at the point content stops. */}
      <g stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.7}>
        <path d="M122 62h12" />
        <path d="M128 56v12" transform="rotate(45 128 62)" />
      </g>
    </svg>
  );
}

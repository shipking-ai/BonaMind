import '../../styles/graphics.css';

/**
 * OfflineArt — shown when the AI chain is unreachable mid-session.
 *
 * The message this has to carry is "your studying is safe, only the AI
 * link is down", so the drawing keeps the deck solid and breaks only the
 * link: a card on the left, the cloud on the right, and a severed
 * connection between them with a crawling dash on the live half.
 *
 * 160×120 grid, matching CaughtUpArt so empty states share a silhouette.
 */
export function OfflineArt({ size = 160, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      width={size}
      height={(size * 120) / 160}
      className={className}
      fill="none"
      role="img"
      aria-label="Offline — studying continues, AI features paused"
    >
      {/* Local deck: fully drawn, full opacity. Nothing here is degraded. */}
      <g stroke="currentColor" strokeLinejoin="round">
        <rect x={14} y={40} width={44} height={40} rx={6} strokeWidth={2} />
        <path d="M22 34h40a6 6 0 0 1 6 6v34" strokeWidth={1.5} opacity={0.4} />
      </g>
      <g stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.45}>
        <path d="M24 54h16" />
        <path d="M24 64h24" />
      </g>

      {/* Live half of the link, still animating out of the deck. */}
      <path
        d="M62 60h16"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="4 6"
        className="am-crawl"
        opacity={0.7}
      />

      {/* The break. Two short strokes, not an X — a severed line reads as
          interrupted, an X reads as forbidden. */}
      <g stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.55}>
        <path d="M84 52 90 60 84 68" />
        <path d="M100 52 94 60 100 68" />
      </g>

      {/* Cloud: dashed outline because it is currently unreachable. */}
      <path
        d="M116 72a13 13 0 0 1 1.5-25.9 17 17 0 0 1 31.4 4.6A11 11 0 0 1 146 72Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeDasharray="5 5"
        opacity={0.4}
      />
    </svg>
  );
}

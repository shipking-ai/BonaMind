import '../../styles/graphics.css';

/**
 * CaughtUpArt — shown when every card in a deck is scheduled ahead.
 *
 * The subject is the FSRS schedule itself: three cards fanned back in
 * depth, each further right and further into the future, with the review
 * horizon drawn as a baseline they all sit above. It is a picture of
 * "nothing is due", not a generic checkmark-in-a-circle.
 *
 * 160×120 grid. Card corners share the 6px radius used by the UI's
 * --platform-button-radius so the illustration reads as the same family
 * as the surrounding chrome.
 */
export function CaughtUpArt({ size = 160, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      width={size}
      height={(size * 120) / 160}
      className={className}
      fill="none"
      role="img"
      aria-label="All caught up — no cards due"
    >
      {/* Review horizon. Dashed to read as "time", solid would read as ground. */}
      <path
        d="M12 96h136"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray="2 6"
        opacity={0.35}
      />

      {/* Cards recede right-and-up: later due date, lighter presence. */}
      <g stroke="currentColor" strokeLinejoin="round">
        <rect
          x={86}
          y={38}
          width={54}
          height={40}
          rx={6}
          strokeWidth={1.5}
          opacity={0.28}
        />
        <rect
          x={62}
          y={30}
          width={54}
          height={44}
          rx={6}
          strokeWidth={1.5}
          opacity={0.5}
        />
        <rect x={22} y={22} width={58} height={52} rx={6} strokeWidth={2} />
      </g>

      {/* Content ruling on the front card only — depth cue, and it keeps
          the back cards from competing for attention. */}
      <g stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.45}>
        <path d="M34 40h22" />
        <path d="M34 50h34" />
      </g>

      {/* The tick is drawn small and sits on the horizon, not over the
          cards — it marks the schedule as clear rather than badging a card. */}
      <g transform="translate(104 84)">
        <circle cx={12} cy={12} r={11} stroke="currentColor" strokeWidth={2} opacity={0.4} />
        <path
          d="M6.5 12.5 10.5 16.5 17.5 8"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          className="am-draw"
        />
      </g>
    </svg>
  );
}

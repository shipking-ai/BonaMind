import '../../styles/graphics.css';

/**
 * AchievementArt — an unlocked achievement.
 *
 * Deliberately not a trophy or a star burst. The reward in a spaced
 * repetition app is a completed cycle, so the mark is a closed ring with
 * the tier notched into it — legible at 32px in a list, and it scales to
 * a modal without becoming a different drawing.
 *
 * 64×64 grid. `tier` 1..3 notches the ring; beyond that it clamps.
 */
export function AchievementArt({
  tier = 1,
  size = 64,
  locked = false,
  className,
}: {
  tier?: 1 | 2 | 3;
  size?: number;
  locked?: boolean;
  className?: string;
}) {
  const notches = Math.max(1, Math.min(3, tier));
  // Ring circumference at r=26, split into `notches` equal arcs with gaps.
  const C = 2 * Math.PI * 26;
  const gap = 10;
  const arc = C / notches - gap;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      fill="none"
      role="img"
      aria-label={locked ? `Locked achievement, tier ${notches}` : `Achievement unlocked, tier ${notches}`}
    >
      {/* Track behind the notched ring keeps the silhouette stable
          between locked and unlocked states. */}
      <circle cx={32} cy={32} r={26} stroke="currentColor" strokeWidth={2} opacity={0.18} />

      <g transform="rotate(-90 32 32)">
        <circle
          cx={32}
          cy={32}
          r={26}
          stroke="currentColor"
          strokeWidth={locked ? 2 : 3}
          strokeLinecap="round"
          strokeDasharray={`${arc.toFixed(1)} ${gap}`}
          opacity={locked ? 0.35 : 1}
        />
      </g>

      {locked ? (
        // Closed padlock shackle — minimal, no keyhole detail at this size.
        <g stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.5}>
          <rect x={25} y={31} width={14} height={12} rx={3} />
          <path d="M28 31v-3a4 4 0 0 1 8 0v3" />
        </g>
      ) : (
        <path
          d="M24 32.5 29.5 38 40 27"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          className="am-draw"
        />
      )}
    </svg>
  );
}

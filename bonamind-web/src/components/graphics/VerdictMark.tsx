import '../../styles/graphics.css';

/**
 * VerdictMark — the result of one graded answer.
 *
 * 48×48 grid. The stroke draws on via `pathLength={1}`, so the tick and
 * the cross take exactly the same time to appear despite having different
 * real path lengths — a tick that resolved faster than a cross would make
 * "correct" feel like the default outcome.
 *
 * Colour comes from the parent via currentColor; this file takes no view
 * on whether wrong answers should be red or amber.
 */
export function VerdictMark({
  correct,
  size = 48,
  className,
}: {
  correct: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      fill="none"
      role="img"
      aria-label={correct ? 'Correct' : 'Not quite'}
    >
      <circle cx={24} cy={24} r={21} stroke="currentColor" strokeWidth={2} opacity={0.35} />
      <g
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        className="am-draw"
      >
        {correct ? (
          <path d="M15 24.5 21 30.5 33 17.5" />
        ) : (
          <>
            <path d="M17 17 31 31" />
            <path d="M31 17 17 31" />
          </>
        )}
      </g>
    </svg>
  );
}

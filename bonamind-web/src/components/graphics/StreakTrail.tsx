/**
 * StreakTrail — the last seven days of study, not a flame.
 *
 * A flame says "you have a streak" and nothing else. This says which days
 * you actually studied, which is the information a student needs to
 * decide whether today matters. Today is drawn as a ring rather than a
 * fill until it is earned, so the gap is visible before it becomes a break.
 *
 * 140×32 grid: 7 marks, 20px pitch, 8px radius.
 */

const PITCH = 20;
const R = 7;
const CY = 16;
const X0 = 10;

export function StreakTrail({
  /** Oldest-first, length 7. `true` = studied that day. */
  days,
  size = 140,
  className,
}: {
  days: boolean[];
  size?: number;
  className?: string;
}) {
  const week = days.slice(-7);
  while (week.length < 7) week.unshift(false);

  const streak = (() => {
    let n = 0;
    for (let i = week.length - 1; i >= 0; i--) {
      if (!week[i]) break;
      n++;
    }
    return n;
  })();

  return (
    <svg
      viewBox="0 0 140 32"
      width={size}
      height={(size * 32) / 140}
      className={className}
      fill="none"
      role="img"
      aria-label={`${streak}-day streak. Last seven days: ${week
        .map((d) => (d ? 'studied' : 'missed'))
        .join(', ')}.`}
    >
      {week.map((studied, i) => {
        const cx = X0 + i * PITCH;
        const isToday = i === week.length - 1;
        const prev = week[i - 1];

        return (
          <g key={i}>
            {/* Connector drawn only between two consecutive studied days,
                so an unbroken run reads as one continuous object. */}
            {i > 0 && prev && studied && (
              <path
                d={`M${cx - PITCH + R} ${CY}H${cx - R}`}
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              />
            )}
            {studied ? (
              <circle cx={cx} cy={CY} r={R} fill="currentColor" />
            ) : (
              <circle
                cx={cx}
                cy={CY}
                r={R}
                stroke="currentColor"
                strokeWidth={2}
                opacity={isToday ? 0.85 : 0.28}
                strokeDasharray={isToday ? undefined : '2 3'}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

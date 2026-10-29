/**
 * Announcer
 *
 * Visually-hidden aria-live container used to broadcast gamification events
 * (streak unlock, achievement, level up) to screen-reader users without
 * flashing visible UI.
 *
 * Usage:
 *   const announce = useAnnouncer();
 *   <Announcer message={streakDay ? `${streakDay}-day streak unlocked` : null} />
 *
 * Mounted once near the app root. Each message it receives queues up in
 * the live region; polite priority = doesn't interrupt screen reader flow.
 */
import React, { useEffect, useState } from 'react';

interface AnnouncerProps {
  message: string | null;
}

const Announcer: React.FC<AnnouncerProps> = ({ message }) => {
  const [queued, setQueued] = useState<string>('');

  useEffect(() => {
    if (!message) return;
    // Tiny pulse-clear forces SRs to re-read even if message text is identical to last one.
    setQueued('');
    const t = window.setTimeout(() => setQueued(message), 60);
    return () => window.clearTimeout(t);
  }, [message]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="absolute -left-[10000px] h-px w-px overflow-hidden"
    >
      {queued}
    </div>
  );
};

export default Announcer;

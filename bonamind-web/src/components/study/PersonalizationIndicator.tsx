/**
 * PersonalizationIndicator — quiet chip shown when the user's FSRS weights
 * are tuned to their actual recall curve rather than the default schedule.
 *
 * The chip is intentionally unobtrusive: most users do not care about the
 * underlying algorithm and a giant personalized-ML badge reads like AI
 * slop. We surface it where the user already expects to see engineering
 * metadata — the study session top bar — and only when personalization is
 * actually active.
 */
import React from 'react';
import { Sparkles, Loader2 } from '@/components/icons';

interface PersonalizationIndicatorProps {
  status: 'loading' | 'default' | 'personalized';
  profileLabel: string | null;
}

export const PersonalizationIndicator: React.FC<PersonalizationIndicatorProps> = ({
  status,
  profileLabel,
}) => {
  if (status === 'default') return null;
  if (status === 'loading') {
    return (
      <span
        className="hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-[#111118] border border-[#2A2A3A] text-[#7A7A96] text-[11px]"
        title="Tuning your FSRS schedule to your recall history"
      >
        <Loader2 size={11} className="animate-spin" />
        Tuning schedule
      </span>
    );
  }
  return (
    <span
      className="hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-[#7C3AED]/10 border border-[#7C3AED]/30 text-[#8B5CF6] text-[11px]"
      title="Schedule tuned to your recall history"
    >
      <Sparkles size={11} />
      {profileLabel ? `Tuned: ${profileLabel}` : 'Personalized FSRS'}
    </span>
  );
};

export default PersonalizationIndicator;

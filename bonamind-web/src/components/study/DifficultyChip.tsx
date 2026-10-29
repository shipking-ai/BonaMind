/**
 * DifficultyChip — surfaces the per-profile FSRS difficulty bias that the
 * personalization tuner picked for this user, so people understand *what*
 * the bias will do to cards they fork or create before they commit.
 *
 * Renders nothing on unlabeled sessions; otherwise a small inline chip with
 * one icon, the copy's label, and a tooltip explaining the effect.
 */
import React from 'react';
import {
  Sparkles as SparklesIcon,
  Zap,
  Compass,
  Hourglass,
  Eye,
  HeartHandshake,
} from '@/components/icons';
import { chipCopyForProfile, type ProfileChipCopy } from '../../services/study/fsrsAdaptation';

const TONE_CLASSES: Record<ProfileChipCopy['tone'], string> = {
  green: 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300',
  amber: 'bg-amber-500/10 border-amber-400/30 text-amber-300',
  violet: 'bg-violet-500/10 border-violet-400/30 text-violet-300',
  rose: 'bg-rose-500/10 border-rose-400/30 text-rose-300',
  gold: 'bg-yellow-500/10 border-yellow-400/30 text-yellow-300',
  indigo: 'bg-indigo-500/10 border-indigo-400/30 text-indigo-300',
};

const TONE_ICONS: Record<ProfileChipCopy['tone'], React.ComponentType<{ size?: number }>> = {
  green: SparklesIcon,
  amber: Zap,
  violet: Eye,
  rose: HeartHandshake,
  gold: Compass,
  indigo: Hourglass,
};

interface DifficultyChipProps {
  profileLabel: string | null;
  /** Marketplace card rows are tight; study shell has more room. */
  variant?: 'compact' | 'regular';
}

export const DifficultyChip: React.FC<DifficultyChipProps> = ({
  profileLabel,
  variant = 'regular',
}) => {
  const copy = chipCopyForProfile(profileLabel);
  if (!copy) return null;
  const Icon = TONE_ICONS[copy.tone];
  const tooltip = copy.blurb;
  if (variant === 'compact') {
    return (
      <span
        title={tooltip}
        className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[9px] font-medium border ${TONE_CLASSES[copy.tone]}`}
      >
        <Icon size={9} />
        {copy.label}
      </span>
    );
  }
  return (
    <span
      title={tooltip}
      className={`hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[11px] ${TONE_CLASSES[copy.tone]}`}
    >
      <Icon size={11} />
      {copy.label}
    </span>
  );
};

export default DifficultyChip;

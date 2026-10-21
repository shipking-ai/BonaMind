import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, ThumbsUp, ThumbsDown, RotateCcw, PlusCircle } from '@/components/icons';

interface Props {
  /** Plain text content to copy on Copy-click. */
  copyText: string;
  /** Show a "Save as card" button when hasSaveCard is true. */
  hasSaveCard?: boolean;
  /** Already saved? Suppresses the save button and shows a ✓ Saved chip. */
  saved?: boolean;
  /** Click handlers. Each is wired up to whatever the parent already does. */
  onSaveCard?: () => void;
  onRegenerate?: () => void;
  /** Optional thumbs-up/thumbs-down feedback hooks. */
  onFeedback?: (kind: 'up' | 'down') => void;
}

/**
 * MessageActions — icon row that hovers in beneath every AI message.
 *
 * Two visible states:
 *   - Collapsed (default): a single low-key "Copy + more" chip
 *   - Expanded (hover/focus): copy / save / regenerate / thumbs-up/down
 *
 * On touch devices, the hover state never activates — the chip is
 * always expanded so a thumb tap can hit any of the actions.
 *
 * We pull the inline pattern from Cursor/ChatGPT/Claude. The visual
 * elements are subdued so they don't overpower the actual answer.
 */
export default function MessageActions({
  copyText,
  hasSaveCard,
  saved,
  onSaveCard,
  onRegenerate,
  onFeedback,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard API blocked — silently no-op */
    }
  };

  const clickFeedback = (kind: 'up' | 'down') => {
    setFeedback(kind);
    onFeedback?.(kind);
    // Auto-clear after a moment so the user can change their mind.
    // Guarded by feedbackTimerRef so unmounting during the window
    // never fires a setState-on-unmounted-component warning.
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback((k) => (k === kind ? null : k));
    }, 4000);
  };

  return (
    <div
      className="
        mt-1.5 ml-1 flex items-center gap-1
        opacity-0 group-hover:opacity-100 focus-within:opacity-100
        transition-opacity duration-150
        [@media(hover:none)]:opacity-100
      "
    >
      <ActionChip
        label={copied ? 'Copied' : 'Copy'}
        icon={copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
        onClick={handleCopy}
      />
      {hasSaveCard && !saved && onSaveCard && (
        <ActionChip
          label="Save as card"
          icon={<PlusCircle size={10} className="text-violet-400" />}
          onClick={onSaveCard}
          accent="violet"
        />
      )}
      {saved && (
        <span className="flex items-center gap-1 px-2 py-1 text-[10px] text-emerald-400">
          <Check size={10} /> Saved
        </span>
      )}
      {onRegenerate && (
        <ActionChip
          label="Regenerate"
          icon={<RotateCcw size={10} />}
          onClick={onRegenerate}
          accent="amber"
        />
      )}
      {onFeedback && (
        <>
          <ActionChip
            label="Helpful"
            icon={
              <ThumbsUp
                size={10}
                className={feedback === 'up' ? 'text-emerald-400' : undefined}
              />
            }
            onClick={() => clickFeedback('up')}
            active={feedback === 'up'}
          />
          <ActionChip
            label="Not helpful"
            icon={
              <ThumbsDown
                size={10}
                className={feedback === 'down' ? 'text-rose-400' : undefined}
              />
            }
            onClick={() => clickFeedback('down')}
            active={feedback === 'down'}
          />
        </>
      )}
    </div>
  );
}

interface ChipProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  accent?: 'violet' | 'amber' | 'neutral';
  active?: boolean;
}

function ActionChip({ label, icon, onClick, accent = 'neutral', active }: ChipProps) {
  const accentClass =
    accent === 'violet'
      ? 'text-[#8B5CF6] hover:text-[#A78BFA] hover:bg-[#7C3AED]/10'
      : accent === 'amber'
      ? 'text-[#F59E0B] hover:text-[#FBBF24] hover:bg-[#F59E0B]/10'
      : 'text-[#7A7A96] hover:text-[#8A8AA3] hover:bg-[#1A1A24]';
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-all ${accentClass} ${
        active ? 'bg-[#1A1A24]' : ''
      }`}
    >
      {icon}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          transition={{ duration: 0.12 }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

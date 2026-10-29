/**
 * MultiplayerStudyBanner — surface showing who is currently studying the
 * same deck as you on /dashboard/study.
 *
 * Pure renderer for the PeerState array returned by useMultiplayerStudy;
 * has no realtime of its own.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Wifi, WifiOff } from '@/components/icons';
import type { MultiplayerState } from '../../hooks/useMultiplayerStudy';

interface Props {
  state: MultiplayerState | null;
  onToggleJoin: () => void;
  joined: boolean;
  deckTitle: string;
}

const RATING_LABEL: Record<string, string> = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
};

const RATING_COLOR: Record<string, string> = {
  again: 'bg-red-500/15 text-red-300 border-red-500/30',
  hard: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  good: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  easy: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
};

export default function MultiplayerStudyBanner({ state, onToggleJoin, joined, deckTitle }: Props) {
  if (!joined) {
    return (
      <button
        onClick={onToggleJoin}
        className="w-full text-left p-3 rounded-xl border border-[#2A2A3A] bg-[#111118] hover:border-[#7C3AED]/40 hover:bg-[#15151D] transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#1A1A24] border border-[#2A2A3A] flex items-center justify-center group-hover:border-[#7C3AED]/30">
            <Users size={15} className="text-[#A78BFA]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#F0EFFE]">Study with others</p>
            <p className="text-[10px] text-[#7A7A96]">Find who's reviewing "{deckTitle}" right now</p>
          </div>
          <span className="text-[10px] text-[#A78BFA] font-semibold">JOIN →</span>
        </div>
      </button>
    );
  }

  const connected = state?.isConnected ?? false;
  const others = state?.others ?? [];
  const online = state?.online ?? 1;

  return (
    <div className="rounded-xl border border-[#2A2A3A] bg-[#0F0F17] overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-[#2A2A3A]/60">
        <div className="flex items-center gap-2.5">
          <div className={`relative w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`}>
            {connected && (
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-40" />
            )}
          </div>
          <span className="text-[11px] font-semibold text-[#F0EFFE]">
            {connected ? <Wifi size={10} className="inline mr-1.5 -mt-0.5" /> : <WifiOff size={10} className="inline mr-1.5 -mt-0.5" />}
            Multiplayer · {online} online
          </span>
        </div>
        <button
          onClick={onToggleJoin}
          className="text-[10px] text-[#7A7A96] hover:text-[#9090A8] uppercase tracking-wider font-bold"
        >
          Leave
        </button>
      </div>

      <div className="px-2 py-1.5 max-h-60 overflow-y-auto">
        {others.length === 0 ? (
          <p className="text-[10px] text-[#7A7A96] text-center py-4">
            {connected ? 'Waiting for someone to join…' : 'Reconnecting…'}
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {others.map((peer) => (
              <motion.div
                key={peer.userId}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#15151D]"
              >
                {peer.avatar ? (
                  <img src={peer.avatar} alt="" className="w-7 h-7 rounded-full" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#6D28D9] flex items-center justify-center text-white text-[10px] font-bold">
                    {peer.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#F0EFFE] truncate">{peer.name}</p>
                  <p className="text-[10px] text-[#7A7A96]">on card #{peer.currentCardIndex + 1}</p>
                </div>
                {peer.lastRating && (
                  <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${RATING_COLOR[peer.lastRating]}`}>
                    {RATING_LABEL[peer.lastRating]}
                  </span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

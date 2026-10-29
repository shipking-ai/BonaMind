import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Brain, Zap, Clock, Flame, BookOpen, Play, Sparkles, ChevronRight, AlertCircle } from '@/components/icons';
import { useDashboardWorkspace } from '../../../contexts/DashboardWorkspaceContext';
import {
  CountUp, FadeUp, StaggerList, StaggerItem, HoverLift, RevealOnScroll, MagneticButton,
} from './motion';

// ─── Study Section ──────────────────────────────────────────────────────────

function StudySection({ title, icon: Icon, accent, children, delay = 0 }: {
  title: string; icon: React.ComponentType<{ className?: string }>; accent: string; children: React.ReactNode; delay?: number;
}) {
  return (
    <FadeUp delay={delay}>
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${accent}`} />
          <h2 className={`text-sm font-semibold ${accent}`}>{title}</h2>
        </div>
        <StaggerList className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" stagger={0.04}>
          {children}
        </StaggerList>
      </section>
    </FadeUp>
  );
}

// ─── Study Deck Card ────────────────────────────────────────────────────────

const DECK_ACCENT_CLASSES: Record<string, string> = {
  rose: 'from-rose-500/20 to-rose-600/10 border-rose-500/20 hover:border-rose-500/40',
  violet: 'from-violet-500/20 to-violet-600/10 border-violet-500/20 hover:border-violet-500/40',
  emerald: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/20 hover:border-emerald-500/40',
  amber: 'from-amber-500/20 to-amber-600/10 border-amber-500/20 hover:border-amber-500/40',
  cyan: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/20 hover:border-cyan-500/40',
};

function StudyDeckCard({ deck, cards, accent, label, onClick, i: _i }: {
  deck: any; cards: any[]; accent: string; label: string; onClick: () => void; i: number;
}) {
  const due = cards.filter(c => c.deckId === deck.id && c.nextReview <= Date.now()).length;
  const total = cards.filter(c => c.deckId === deck.id).length;
  const lastStudied = cards
    .filter(c => c.deckId === deck.id && c.lastReviewed)
    .sort((a, b) => b.lastReviewed - a.lastReviewed)[0];

  const accentClass = DECK_ACCENT_CLASSES[accent] || DECK_ACCENT_CLASSES.violet;

  return (
    <StaggerItem>
      <HoverLift className={`relative overflow-hidden rounded-xl border bg-gradient-to-br p-4 cursor-pointer transition-shadow duration-300 hover:shadow-lg group ${accentClass}`}>
        <button onClick={onClick} className="w-full text-left focus-visible:outline-none">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-sm font-semibold text-white truncate pr-2 group-hover:text-violet-200 transition-colors">
              {deck.title}
            </h3>
            <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
          </div>

          <div className="flex items-center gap-3 text-xs">
            {due > 0 ? (
              <span className="text-violet-300 font-semibold tabular-nums">{due} due</span>
            ) : (
              <span className="text-emerald-400 font-semibold">All reviewed</span>
            )}
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400 tabular-nums">{total} cards</span>
          </div>

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
            {lastStudied ? (
              <span className="text-[10px] text-zinc-500">
                {Math.round((Date.now() - lastStudied.lastReviewed) / 3600000)}h ago
              </span>
            ) : (
              <span className="text-[10px] text-zinc-500">Not started</span>
            )}
            <span className={`text-[10px] font-semibold ${accent === 'rose' ? 'text-rose-300' : accent === 'emerald' ? 'text-emerald-300' : 'text-violet-300'}`}>
              {label}
            </span>
          </div>

          {/* Bottom line */}
          <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </HoverLift>
    </StaggerItem>
  );
}

// ─── Stats Tile ─────────────────────────────────────────────────────────────

function StatTile({ icon: Icon, label, value, accent, i }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: number; accent: string; i: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + i * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3 }}
      className="nova-card flex items-center gap-3 px-4 py-4"
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] ${accent}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xl font-bold tabular-nums tracking-tight text-white">
          <CountUp value={value} duration={0.85} delay={0.2 + i * 0.05} />
        </div>
        <div className="nova-label mt-0.5 !tracking-[0.12em]">{label}</div>
      </div>
    </motion.div>
  );
}

// ─── NovaStudy ──────────────────────────────────────────────────────────────

export function NovaStudy() {
  const navigate = useNavigate();
  const workspace = useDashboardWorkspace();
  const { decks, cards } = workspace!;

  const now = Date.now();
  const todayEndMs = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return end.getTime();
  }, []);

  const { overdue, dueToday, noDue } = useMemo(() => {
    const o: typeof decks = [];
    const d: typeof decks = [];
    const n: typeof decks = [];
    for (const deck of decks) {
      const deckCards = cards.filter(c => c.deckId === deck.id);
      const hasOverdue = deckCards.some(c => (c.nextReview ?? 0) > 0 && (c.nextReview ?? 0) < now);
      const hasDueToday = deckCards.some(c => (c.nextReview ?? 0) >= now && (c.nextReview ?? 0) <= todayEndMs);
      const hasReviewed = deckCards.some(c => (c.lastReviewed ?? 0) > 0);
      if (hasOverdue) o.push(deck);
      else if (hasDueToday) d.push(deck);
      else if (hasReviewed) n.push(deck);
    }
    return { overdue: o, dueToday: d, noDue: n };
  }, [decks, cards, now, todayEndMs]);

  const totalDue = cards.filter(c => (c.nextReview ?? 0) > 0 && (c.nextReview ?? 0) <= todayEndMs).length;
  const studiedToday = cards.filter(c => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return (c.lastReviewed ?? 0) >= d.getTime();
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <FadeUp y={6}>
        <div className="nova-card-elevated flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div>
            <div className="nova-label text-violet-200/80">Session desk</div>
            <h1 className="nova-display mt-1 text-3xl text-white sm:text-4xl">Study</h1>
            <p className="mt-2 text-sm text-zinc-300/85 tabular-nums">
              {totalDue > 0 ? `${totalDue} cards ready for review` : 'All caught up — optional mastery pass available'}
            </p>
          </div>
          <MagneticButton
            onClick={() => {
              if (decks.length > 0 && totalDue > 0) {
                const dueDeck = decks.find(d => cards.some(c => c.deckId === d.id && (c.nextReview ?? 0) <= todayEndMs));
                navigate(`/dashboard/study/${dueDeck?.id || decks[0]?.id}`);
              } else if (decks.length > 0) {
                navigate(`/dashboard/study/${decks[0].id}`);
              }
            }}
            disabled={decks.length === 0}
            className="nova-cta disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Start session
          </MagneticButton>
        </div>
      </FadeUp>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={Zap} label="Due Today" value={totalDue} accent="text-violet-400" i={0} />
        <StatTile icon={Clock} label="Studied Today" value={studiedToday} accent="text-emerald-400" i={1} />
        <StatTile icon={BookOpen} label="Total Decks" value={decks.length} accent="text-cyan-400" i={2} />
        <StatTile icon={Flame} label="Total Cards" value={cards.length} accent="text-amber-400" i={3} />
      </div>

      {/* Overdue Section */}
      {overdue.length > 0 && (
        <StudySection title="Overdue" icon={AlertCircle} accent="text-rose-400" delay={0.05}>
          {overdue.map((deck, i) => {
            const due = cards.filter(c => c.deckId === deck.id && (c.nextReview ?? 0) < now).length;
            return (
              <StudyDeckCard
                key={deck.id} deck={deck} cards={cards} accent="rose"
                label={`${due} overdue`}
                onClick={() => navigate(`/dashboard/study/${deck.id}`)} i={i}
              />
            );
          })}
        </StudySection>
      )}

      {/* Due Today Section */}
      {dueToday.length > 0 && (
        <StudySection title="Due Today" icon={Zap} accent="text-violet-400" delay={0.1}>
          {dueToday.map((deck, i) => (
            <StudyDeckCard
              key={deck.id} deck={deck} cards={cards} accent="violet"
              label="Due today"
              onClick={() => navigate(`/dashboard/study/${deck.id}`)} i={i}
            />
          ))}
        </StudySection>
      )}

      {/* All Reviewed */}
      {noDue.length > 0 && overdue.length === 0 && dueToday.length === 0 && (
        <RevealOnScroll>
          <StudySection title="All Reviewed" icon={Flame} accent="text-emerald-400" delay={0.15}>
            {noDue.map((deck, i) => (
              <StudyDeckCard
                key={deck.id} deck={deck} cards={cards} accent="emerald"
                label="All caught up"
                onClick={() => navigate(`/dashboard/study/${deck.id}`)} i={i}
              />
            ))}
          </StudySection>
        </RevealOnScroll>
      )}

      {/* Empty State */}
      {decks.length === 0 && (
        <FadeUp delay={0.15}>
          <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-12 text-center">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 220, damping: 18 }}
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-violet-600/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4"
            >
              <Brain className="w-6 h-6 text-violet-300" />
            </motion.div>
            <h3 className="text-sm font-semibold text-white mb-2">No decks to study</h3>
            <p className="text-xs text-zinc-500 mb-5">Create a deck or generate one with AI to get started</p>
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/dashboard/decks')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-violet-500 text-white text-sm font-semibold rounded-xl hover:from-violet-500 hover:to-violet-400 transition-all shadow-lg shadow-violet-500/20"
            >
              <Sparkles className="w-4 h-4" /> Go to Library
            </motion.button>
          </div>
        </FadeUp>
      )}
    </div>
  );
}

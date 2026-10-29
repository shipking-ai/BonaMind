/**
 * Quick Review: the corner panel opened by Ctrl+Alt+Space, the tray or a
 * notification. Up to 10 due cards, most overdue first; Space flips, 1–4
 * rates, Esc hides. Ratings use the study screen's path (rateCard) and the
 * main window refreshes its counts through the shell.
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { Card } from '../../types';
import { Rating } from '../../types';
import { dbService } from '../../services/database/dbService';
import { rateCard } from '../../services/study/rateCard';
import { desktop } from '../../desktop/bridge';
import { useCurrentUserId } from '../../hooks/useCurrentUserId';

export const QUICK_REVIEW_LIMIT = 10;
export const DONE_HIDE_MS = 2000;

const RATINGS = [
  ['Again', Rating.AGAIN],
  ['Hard', Rating.HARD],
  ['Good', Rating.GOOD],
  ['Easy', Rating.EASY],
] as const;

export function pickDueCards(cards: Card[], now: number, limit = QUICK_REVIEW_LIMIT): Card[] {
  return cards
    .filter((c) => (c.nextReview ?? 0) <= now)
    .sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))
    .slice(0, limit);
}

export function formatNextDue(ms: number | null, now: number): string {
  if (ms === null) return '';
  const minutes = Math.max(1, Math.round((ms - now) / 60_000));
  if (minutes < 60) return `Next card due in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Next card due in ${hours}h`;
  return 'Next card due tomorrow';
}

export default function QuickReviewPage() {
  const userId = useCurrentUserId();
  const [queue, setQueue] = useState<Card[]>([]);
  const [deckTitles, setDeckTitles] = useState<Record<string, string>>({});
  const [nextDue, setNextDue] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // platform-desktop brings in the Windows look (windows.css); the main
    // window gets it from DesktopChrome, which this window doesn't render.
    document.documentElement.classList.add('quick-review-window', 'platform-desktop');
    return () => document.documentElement.classList.remove('quick-review-window', 'platform-desktop');
  }, []);

  const load = useCallback(async () => {
    if (typeof userId !== 'string') return;
    setLoading(true);
    // This window lives on between uses, and fetchCards answers from a cache:
    // without clearing it, cards studied in the main window came back here.
    dbService.clearCache();
    const [cards, decks] = await Promise.all([dbService.fetchCards(userId), dbService.fetchDecks(userId)]);
    const now = Date.now();
    setQueue(pickDueCards(cards, now));
    const future = cards.map((c) => c.nextReview ?? 0).filter((t) => t > now);
    setNextDue(future.length ? Math.min(...future) : null);
    setDeckTitles(Object.fromEntries(decks.map((d) => [d.id, d.title])));
    setIndex(0);
    setRevealed(false);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  // The window is hidden, not closed, between uses: reload when it returns.
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [load]);

  const done = !loading && index >= queue.length;
  const card = queue[index];

  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => void desktop.quickReviewDone(), DONE_HIDE_MS);
    return () => clearTimeout(id);
  }, [done]);

  const rate = useCallback(async (rating: Rating) => {
    if (!card || !revealed) return;
    await rateCard({ card, rating, userId, surface: 'quick-review' });
    void desktop.cardsChanged();
    setRevealed(false);
    setIndex((i) => i + 1);
  }, [card, revealed, userId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { void desktop.quickReviewDone(); return; }
      if (!card) return;
      if (e.code === 'Space') { e.preventDefault(); setRevealed(true); return; }
      const n = Number.parseInt(e.key, 10);
      if (n >= 1 && n <= 4) void rate(RATINGS[n - 1][1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, rate]);

  const shell = 'qr-card flex h-screen w-screen flex-col select-none';

  if (userId === null) {
    return (
      <div className={`${shell} items-center justify-center gap-3 text-center`}>
        <p className="qr-muted">Sign in to review your cards.</p>
        <button
          type="button"
          onClick={() => { void desktop.showMain('/auth'); void desktop.quickReviewDone(); }}
          className="qr-button qr-button-primary"
        >
          Sign in to BonaMind
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className={`${shell} items-center justify-center text-center transition-opacity`}>
        <p className="qr-question">All caught up</p>
        <p className="qr-muted">{formatNextDue(nextDue, Date.now())}</p>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className="qr-meta flex items-center justify-between">
        <span className="truncate">Quick review{card ? ` · ${deckTitles[card.deckId] ?? ''}` : ''}</span>
        <span className="flex items-center gap-3">
          {queue.length > 0 && <span>{index + 1} / {queue.length}</span>}
          <button type="button" aria-label="Close" onClick={() => void desktop.quickReviewDone()} className="qr-close">✕</button>
        </span>
      </div>

      {card && (
        <>
          <p className="qr-question">{card.front || card.question}</p>
          {revealed ? (
            <p className="qr-answer">{card.back || card.answer}</p>
          ) : (
            <button type="button" onClick={() => setRevealed(true)} className="qr-button qr-show">
              Show answer
            </button>
          )}
          <div className="mt-auto">
            <div className="qr-grades" role="group" aria-label="Rate your recall">
              {RATINGS.map(([label, rating], i) => (
                <button
                  key={label}
                  type="button"
                  disabled={!revealed}
                  onClick={() => void rate(rating)}
                  className={`qr-button${label === 'Good' ? ' qr-button-primary' : ''}`}
                >
                  {label} <span className="opacity-50">{i + 1}</span>
                </button>
              ))}
            </div>
            <div className="qr-progress">
              <div style={{ width: `${(index / Math.max(queue.length, 1)) * 100}%` }} />
            </div>
            <p className="qr-hint">Space flip · 1–4 rate · Esc hide</p>
          </div>
        </>
      )}
    </div>
  );
}

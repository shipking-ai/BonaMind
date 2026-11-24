/**
 * A study session in the Android app: one card, full screen, in the app's
 * own dark Prism look.
 *
 * - Tap the card to see the answer (a light haptic tick).
 * - Then grade with the four buttons, each showing when the card comes back,
 *   or swipe the card: right for Good, left for Again, up for Easy.
 * - The system back gesture ends the session (NativeRuntime handles it).
 *
 * Presentation only: StudyModePage owns the queue, grading, scheduling and
 * saving, and renders this in the Android app, as it renders IOSStudySession
 * on iPhone and WindowsStudySession in the Windows app.
 */
import React from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Rating, type Card } from "../../types";
import { formatInterval } from "../../services/study/srs";
import { Check, Mic, X } from "../icons";
import { hapticSelection, hapticTap } from "./androidHaptics";

const GRADES: Array<{ rating: Rating; label: string; tone: string }> = [
  { rating: Rating.AGAIN, label: "Again", tone: "again" },
  { rating: Rating.HARD, label: "Hard", tone: "hard" },
  { rating: Rating.GOOD, label: "Good", tone: "good" },
  { rating: Rating.EASY, label: "Easy", tone: "easy" },
];

/** How far (px) a card has to travel before letting go grades it. */
const SWIPE = 110;

export interface AndroidStudySessionProps {
  deckTitle: string;
  deckId: string;
  card: Card;
  index: number;
  total: number;
  flipped: boolean;
  onFlip: () => void;
  onRate: (rating: Rating) => void;
  onExit: () => void;
  intervals: Partial<Record<Rating, number>>;
  voiceMode: boolean;
  onToggleVoice: () => void;
  voicePanel?: React.ReactNode;
}

export function AndroidStudySession({
  deckTitle,
  card,
  index,
  total,
  flipped,
  onFlip,
  onRate,
  onExit,
  intervals,
  voiceMode,
  onToggleVoice,
  voicePanel,
}: AndroidStudySessionProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-12, 12]);
  const goodOpacity = useTransform(x, [30, SWIPE], [0, 1]);
  const againOpacity = useTransform(x, [-SWIPE, -30], [1, 0]);
  const easyOpacity = useTransform(y, [-SWIPE, -30], [1, 0]);

  const front = card.front || card.question || "";
  const back = card.back || card.answer || "";

  const grade = (rating: Rating) => {
    hapticSelection();
    onRate(rating);
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const { x: dx, y: dy } = info.offset;
    if (dy < -SWIPE && Math.abs(dy) > Math.abs(dx)) grade(Rating.EASY);
    else if (dx > SWIPE) grade(Rating.GOOD);
    else if (dx < -SWIPE) grade(Rating.AGAIN);
  };

  return (
    <div className="android-session" data-testid="android-study-session">
      <header className="android-session-header">
        <button type="button" className="android-session-round" aria-label="End session" onClick={onExit}>
          <X aria-hidden />
        </button>
        <div className="android-session-title">
          <div className="android-session-deck">{deckTitle}</div>
          <div className="android-session-count">
            {index + 1} of {total}
          </div>
        </div>
        <button
          type="button"
          className={`android-session-round ${voiceMode ? "is-on" : ""}`}
          aria-label={voiceMode ? "Turn off voice study" : "Voice study"}
          aria-pressed={voiceMode}
          onClick={() => {
            hapticSelection();
            onToggleVoice();
          }}
        >
          <Mic aria-hidden />
        </button>
      </header>
      <div className="android-session-progress" aria-hidden>
        <motion.div
          className="android-session-progress-fill"
          animate={{ width: `${(index / Math.max(1, total)) * 100}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 30 }}
        />
      </div>

      <div className="android-session-stage">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={card.id}
            className={`android-session-card-wrap ${flipped ? "is-flipped" : ""}`}
            style={{ x, y, rotate }}
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.18 } }}
            drag={flipped}
            dragSnapToOrigin
            dragElastic={0.9}
            onDragEnd={onDragEnd}
          >
            <motion.div
              key={flipped ? "back" : "front"}
              className="android-session-card-turn"
              initial={{ rotateY: flipped ? -90 : 0, opacity: flipped ? 0.4 : 1 }}
              animate={{ rotateY: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
            >
              {flipped ? (
                <div className="android-session-card is-back">
                  <div className="android-session-card-recall">{front}</div>
                  <div className="android-session-card-label">Answer</div>
                  <div className="android-session-card-answer">{back}</div>
                </div>
              ) : (
                <button
                  type="button"
                  className="android-session-card is-front"
                  aria-label="Show answer"
                  onClick={() => {
                    hapticTap();
                    onFlip();
                  }}
                >
                  <span className="android-session-card-label">{deckTitle}</span>
                  <span className="android-session-card-question">{front}</span>
                </button>
              )}
            </motion.div>
            {flipped && (
              <>
                <motion.div className="android-session-stamp is-good" style={{ opacity: goodOpacity }} aria-hidden>
                  Good
                </motion.div>
                <motion.div className="android-session-stamp is-again" style={{ opacity: againOpacity }} aria-hidden>
                  Again
                </motion.div>
                <motion.div className="android-session-stamp is-easy" style={{ opacity: easyOpacity }} aria-hidden>
                  Easy
                </motion.div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {voicePanel && <div className="android-session-voice">{voicePanel}</div>}

      <footer className="android-session-footer">
        {flipped ? (
          <div className="android-session-grades">
            {GRADES.map((g) => (
              <button
                key={g.label}
                type="button"
                className={`android-session-grade is-${g.tone}`}
                onClick={() => grade(g.rating)}
              >
                <span className="android-session-grade-label">{g.label}</span>
                {intervals[g.rating] !== undefined && (
                  <span className="android-session-grade-when">{formatInterval(intervals[g.rating]!)}</span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="android-session-hint">Tap the card to see the answer</div>
        )}
      </footer>
    </div>
  );
}

export function AndroidStudyComplete({
  deckTitle,
  reviewed,
  correct,
  elapsedMs,
  onRestart,
  onDone,
}: {
  deckTitle: string;
  reviewed: number;
  correct: number;
  elapsedMs: number;
  onRestart: () => void;
  onDone: () => void;
}) {
  const accuracy = reviewed ? correct / reviewed : 0;
  const minutes = Math.floor(elapsedMs / 60000);
  const seconds = Math.floor((elapsedMs % 60000) / 1000);
  return (
    <div className="android-session android-session-complete" data-testid="android-study-complete">
      <div className="android-session-complete-body">
        <div className="android-session-complete-badge" aria-hidden>
          <Check />
        </div>
        <h1 className="android-session-complete-title">Session complete</h1>
        <p className="android-session-complete-deck">{deckTitle}</p>
        <dl className="android-session-stats">
          <div>
            <dt>Cards reviewed</dt>
            <dd>{reviewed}</dd>
          </div>
          <div>
            <dt>Accuracy</dt>
            <dd>{Math.round(accuracy * 100)}%</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>
              {minutes}:{String(seconds).padStart(2, "0")}
            </dd>
          </div>
        </dl>
      </div>
      <div className="android-session-complete-actions">
        <button type="button" className="android-session-primary" onClick={onDone}>
          Done
        </button>
        <button type="button" className="android-session-secondary" onClick={onRestart}>
          Study again
        </button>
      </div>
    </div>
  );
}

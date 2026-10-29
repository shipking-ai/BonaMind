import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Quiz } from '../../types';
import MathRichText from '../shared/MathRichText';
import {
  CheckCircleIcon as CheckCircle,
  XCircleIcon as XCircle,
  RotateCcwIcon as RotateCcw,
  TargetIcon as Target,
  ChevronLeftIcon as ChevronLeft,
  ChevronRightIcon as ChevronRight,
  SparklesIcon as Sparkles,
  BookOpenIcon as BookOpen,
  ShuffleIcon as Shuffle,
} from '../icons/CustomIcons';

interface DashboardQuizProps {
  quiz: Quiz;
  onComplete?: (score: number, total: number) => void;
}

type AnswerState = Record<number, { selected: number; correct: boolean }>;

const DashboardQuiz: React.FC<DashboardQuizProps> = ({ quiz, onComplete }) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [submittedQuestions, setSubmittedQuestions] = useState<Record<number, boolean>>({});
  const [answerResults, setAnswerResults] = useState<AnswerState>({});
  const [showResults, setShowResults] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);

  const questions = useMemo(() => {
    if (!isShuffled) return quiz.questions;
    const shuffled = [...quiz.questions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [quiz.questions, isShuffled]);

  // Guard against empty quiz
  if (questions.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-12 text-center">
        <BookOpen size={40} className="text-zinc-600 mx-auto mb-4" />
        <p className="text-zinc-400 text-lg font-medium">This quiz has no questions yet.</p>
        <p className="text-zinc-500 text-sm mt-1">Add cards to this deck to generate quiz questions.</p>
      </div>
    );
  }

  const currentQ = questions[currentQuestion];
  const isAnswered = selectedAnswers[currentQuestion] !== undefined;
  const isSubmitted = submittedQuestions[currentQuestion];
  const currentResult = answerResults[currentQuestion];

  const score = Object.values(answerResults).filter(r => r.correct).length;
  const totalAnswered = Object.keys(submittedQuestions).length;
  const progressPercent = Math.round((totalAnswered / questions.length) * 100);

  const handleAnswerSelect = (answerIndex: number) => {
    if (isSubmitted) return;
    setSelectedAnswers(prev => ({ ...prev, [currentQuestion]: answerIndex }));
  };

  const handleCheckAnswer = () => {
    if (selectedAnswers[currentQuestion] === undefined) return;
    const isCorrect = selectedAnswers[currentQuestion] === currentQ.correctAnswer;
    setAnswerResults(prev => ({
      ...prev,
      [currentQuestion]: { selected: selectedAnswers[currentQuestion], correct: isCorrect },
    }));
    setSubmittedQuestions(prev => ({ ...prev, [currentQuestion]: true }));
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
    }
  };

  const handleFinish = () => {
    setShowResults(true);
    onComplete?.(score, questions.length);
  };

  const handleRetake = () => {
    setCurrentQuestion(0);
    setSelectedAnswers({});
    setSubmittedQuestions({});
    setAnswerResults({});
    setShowResults(false);
    setIsShuffled(false);
  };

  const toggleShuffle = () => {
    setIsShuffled(prev => !prev);
    setSelectedAnswers({});
    setSubmittedQuestions({});
    setAnswerResults({});
    setCurrentQuestion(0);
  };

  const allSubmitted = questions.every((_, i) => submittedQuestions[i]);

  // ─── Results Screen ───────────────────────────────────────────────
  if (showResults) {
    const percentage = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
    const grade = percentage >= 80 ? 'Excellent!' : percentage >= 60 ? 'Good job!' : 'Keep practicing!';
    const gradeColor = percentage >= 80 ? 'text-emerald-400' : percentage >= 60 ? 'text-amber-400' : 'text-red-400';
    const gradeBg = percentage >= 80 ? 'from-emerald-500/20 to-teal-600/20' : percentage >= 60 ? 'from-amber-500/20 to-yellow-600/20' : 'from-red-500/20 to-pink-600/20';

    return (
      <motion.div
        className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Results Header */}
        <div className="p-8 text-center border-b border-zinc-800/50">
          <motion.div
            className={`w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br ${gradeBg} flex items-center justify-center border border-zinc-700/50`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          >
            <Target size={32} className={gradeColor} />
          </motion.div>
          <h3 className="text-xl font-bold text-white mb-1">{quiz.title} — Complete</h3>
          <p className={`text-sm font-medium ${gradeColor} mb-3`}>{grade}</p>
          <div className="text-5xl font-black text-white mb-2">
            <span className={gradeColor}>{percentage}%</span>
          </div>
          <p className="text-sm text-zinc-400">
            {score} of {questions.length} questions correct
          </p>
        </div>

        {/* Question-by-question breakdown */}
        <div className="p-5 space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
          {questions.map((q, i) => {
            const result = answerResults[i];
            const wasAnswered = result !== undefined;
            const isCorrect = result?.correct;
            const userAnswer = result?.selected;
            return (
              <div
                key={q.id}
                className={`p-4 rounded-xl border text-sm transition-colors ${
                  !wasAnswered
                    ? 'bg-zinc-800/20 border-zinc-800/40'
                    : isCorrect
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : 'bg-red-500/5 border-red-500/20'
                }`}
              >
                <div className="flex items-start gap-3">
                  {!wasAnswered ? (
                    <div className="w-[18px] h-[18px] rounded-full border-2 border-zinc-600 mt-0.5 shrink-0" />
                  ) : isCorrect ? (
                    <CheckCircle size={18} className="text-emerald-400 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle size={18} className="text-red-400 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-200 text-sm font-medium leading-relaxed">
                      <MathRichText text={q.question} />
                    </p>
                    {!wasAnswered && (
                      <p className="text-xs text-zinc-600 mt-1.5 italic">Skipped</p>
                    )}
                    {wasAnswered && !isCorrect && (
                      <p className="text-xs text-zinc-500 mt-1.5">
                        Your answer:{' '}
                        <span className="text-red-400"><MathRichText text={q.options[userAnswer!]} /></span>
                      </p>
                    )}
                    {wasAnswered && (
                      <p className="text-xs text-emerald-400 mt-1">
                        Correct:{' '}
                        <span className="text-emerald-300"><MathRichText text={q.options[q.correctAnswer]} /></span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-zinc-800/50 flex gap-3">
          <button
            onClick={handleRetake}
            className="flex-1 p-3 rounded-xl bg-violet-600 text-white hover:bg-violet-500 transition-all text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <RotateCcw size={14} />
            Retake Quiz
          </button>
        </div>
      </motion.div>
    );
  }

  // ─── Quiz Taking View ─────────────────────────────────────────────
  return (
    <motion.div
      className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      <div className="px-6 py-5 border-b border-zinc-800/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg border ${
              quiz.difficulty === 'easy'
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : quiz.difficulty === 'medium'
                  ? 'bg-amber-500/10 border-amber-500/20'
                  : 'bg-red-500/10 border-red-500/20'
            }`}>
              <Target size={16} className={
                quiz.difficulty === 'easy' ? 'text-emerald-400'
                : quiz.difficulty === 'medium' ? 'text-amber-400'
                : 'text-red-400'
              } />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{quiz.title}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  quiz.difficulty === 'easy'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : quiz.difficulty === 'medium'
                      ? 'bg-amber-500/15 text-amber-400'
                      : 'bg-red-500/15 text-red-400'
                }`}>
                  {quiz.difficulty}
                </span>
                <span className="text-[11px] text-zinc-500">
                  {totalAnswered}/{questions.length} answered
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={toggleShuffle}
            className={`p-2.5 rounded-lg border transition-all ${
              isShuffled
                ? 'bg-violet-500/10 border-violet-500/30 text-violet-400'
                : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:text-zinc-300'
            }`}
            title="Shuffle questions"
          >
            <Shuffle size={15} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full"
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>

        {/* Question dots */}
        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          {questions.map((_, i) => {
            const isCurrent = i === currentQuestion;
            const isAnsweredDot = submittedQuestions[i];
            const isCorrectDot = answerResults[i]?.correct;
            return (
              <button
                key={i}
                onClick={() => setCurrentQuestion(i)}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-200 ${
                  isCurrent
                    ? 'bg-violet-400 w-4 ring-2 ring-violet-500/30'
                    : isAnsweredDot
                      ? isCorrectDot
                        ? 'bg-emerald-400'
                        : 'bg-red-400'
                      : 'bg-zinc-700 hover:bg-zinc-600'
                }`}
                // A title attribute can only hold text, so this states the
              // result in words rather than a ✓/✗ glyph — which also reads
              // correctly to a screen reader.
              title={`Question ${i + 1}${
                isAnsweredDot ? (isCorrectDot ? ' — correct' : ' — incorrect') : ''
              }`}
              />
            );
          })}
        </div>
      </div>

      {/* Question Area */}
      <div className="p-6">
        {/* Question header */}
        {currentQ.header && (
          <div className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-3">
            {currentQ.header}
          </div>
        )}

        {/* Question number & text */}
        <div className="flex items-start gap-3 mb-6">
          <span className="text-xs font-black text-zinc-500 uppercase shrink-0 mt-0.5 bg-zinc-800/80 px-2 py-1 rounded-md">
            Q{currentQuestion + 1}
          </span>
          <p className="text-lg font-semibold text-white leading-relaxed">
            <MathRichText text={currentQ.question} />
          </p>
        </div>

        {/* Options */}
        <div className="space-y-3 mb-6">
          {currentQ.options.map((option, oi) => {
            const isSelected = selectedAnswers[currentQuestion] === oi;
            const isCorrectAnswer = oi === currentQ.correctAnswer;
            const _result = answerResults[currentQuestion];

            let optionStyle = 'border-zinc-800/60 bg-zinc-800/30 hover:border-zinc-700/60 hover:bg-zinc-800/50';

            if (isSubmitted) {
              if (isCorrectAnswer) {
                optionStyle = 'border-emerald-500/40 bg-emerald-500/10';
              } else if (isSelected && !isCorrectAnswer) {
                optionStyle = 'border-red-500/40 bg-red-500/10';
              } else {
                optionStyle = 'border-zinc-800/60 bg-zinc-800/20 opacity-50';
              }
            } else if (isSelected) {
              optionStyle = 'border-violet-500/40 bg-violet-500/10';
            }

            const optionLetter = String.fromCharCode(65 + oi); // A, B, C, D

            return (
              <button
                key={oi}
                onClick={() => handleAnswerSelect(oi)}
                disabled={isSubmitted}
                className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${optionStyle} ${
                  isSubmitted ? 'cursor-default' : 'cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 text-xs font-bold transition-all ${
                    isSubmitted && isCorrectAnswer
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : isSubmitted && isSelected && !isCorrectAnswer
                        ? 'border-red-500 bg-red-500 text-white'
                        : isSelected
                          ? 'border-violet-500 bg-violet-500 text-white'
                          : 'border-zinc-600 text-zinc-500'
                  }`}>
                    {isSubmitted && isCorrectAnswer ? (
                      <CheckCircle size={14} className="text-white" />
                    ) : isSubmitted && isSelected && !isCorrectAnswer ? (
                      <XCircle size={14} className="text-white" />
                    ) : (
                      optionLetter
                    )}
                  </span>
                  <span className={`text-sm leading-relaxed ${
                    isSubmitted && isCorrectAnswer
                      ? 'text-emerald-300 font-medium'
                      : isSubmitted && isSelected && !isCorrectAnswer
                        ? 'text-red-300'
                        : 'text-zinc-200'
                  }`}>
                    <MathRichText text={option} />
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Explanation */}
        {isSubmitted && currentQ.explanation && (
          <AnimatePresence>
            <motion.div
              className="mb-6 p-4 rounded-xl bg-violet-500/5 border border-violet-500/20"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-[10px] uppercase tracking-widest text-violet-400 font-black mb-2">
                Explanation
              </p>
              <p className="text-sm text-zinc-300 leading-relaxed">
                <MathRichText text={currentQ.explanation} />
              </p>
            </motion.div>
          </AnimatePresence>
        )}

        {/* Feedback after answering */}
        {isSubmitted && (
          <motion.div
            className={`mb-6 p-4 rounded-xl border ${
              currentResult?.correct
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-red-500/5 border-red-500/20'
            }`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-2">
              {currentResult?.correct ? (
                <>
                  <CheckCircle size={18} className="text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-400">Correct!</span>
                </>
              ) : (
                <>
                  <XCircle size={18} className="text-red-400" />
                  <span className="text-sm font-semibold text-red-400">Incorrect</span>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* Navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrevious}
            disabled={currentQuestion === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-zinc-700 text-zinc-400 text-sm font-medium hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none transition-all"
          >
            <ChevronLeft size={16} />
            Previous
          </button>

          <div className="flex-1" />

          {!isSubmitted ? (
            <button
              onClick={handleCheckAnswer}
              disabled={!isAnswered}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${
                isAnswered
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/20'
                  : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
              }`}
            >
              Check Answer
            </button>
          ) : currentQuestion < questions.length - 1 ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-bold uppercase tracking-wider hover:bg-violet-500 shadow-lg shadow-violet-600/20 transition-all"
            >
              Next
              <ChevronRight size={16} />
            </button>
          ) : allSubmitted ? (
            <button
              onClick={handleFinish}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-bold uppercase tracking-wider hover:from-violet-500 hover:to-purple-500 shadow-lg shadow-violet-600/20 transition-all"
            >
              <Sparkles size={16} />
              View Results
            </button>
          ) : (
            <span className="text-xs text-zinc-600 font-medium">
              Answer all questions to finish
            </span>
          )}
        </div>
      </div>

      {/* Mastery Summary Bar */}
      {totalAnswered > 0 && (
        <div className="px-6 py-3 border-t border-zinc-800/30 bg-zinc-900/40">
          <div className="flex items-center gap-5 text-[11px] flex-wrap">
            <div className="flex items-center gap-1.5">
              <CheckCircle size={12} className="text-emerald-400" />
              <span className="text-zinc-500">
                Correct:{' '}
                <span className="text-emerald-400 font-bold">
                  {Object.values(answerResults).filter(r => r.correct).length}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <XCircle size={12} className="text-red-400" />
              <span className="text-zinc-500">
                Incorrect:{' '}
                <span className="text-red-400 font-bold">
                  {Object.values(answerResults).filter(r => !r.correct).length}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <BookOpen size={12} className="text-zinc-500" />
              <span className="text-zinc-500">
                Remaining: {questions.length - totalAnswered}
              </span>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default DashboardQuiz;




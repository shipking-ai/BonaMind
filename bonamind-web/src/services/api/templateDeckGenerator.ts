/**
 * templateDeckGenerator — deterministic offline fallback for AI deck generation.
 *
 * Why this exists
 * ───────────────
 * `groqService.generateDeckFromTopic` flows through `groqClient`, which calls
 * api.groq.com/openai/v1/chat/completions. If the user's `VITE_GROQ_API_KEY` is
 * missing, revoked, exhausted (429), rejected by Groq (401/403), or the
 * network is offline, the upstream returns a typed `GroqUnavailableError`.
 * Rather than blocking that user with a hard failure, `groqService` now
 * catches the typed error and asks this module for a "good enough" deck so
 * that `Library → New deck → AI` stays usable end-to-end.
 *
 * What this is NOT
 * ────────────────
 * This is NOT a real AI. The questions follow the same generic study-card
 * patterns every teacher/tutor recognises. They are deliberately topic-aware
 * (we substitute `{topic}` into the templates) but they cannot know the
 * actual content of a topic the way an LLM can. The user gets a deck, a
 * spinner completion, and a saved row — and can edit the cards in place
 * (every card is fully editable in `CardsDecks.tsx → + Add a card`).
 *
 * Determinism
 * ───────────
 * Pure function: `(topic: string) => GeneratedDeck`. Same input produces
 * the same output. `groqService` caches the result with cacheKey `deck:<topic>`
 * so a repeated click loads from memory instead of regenerating.
 *
 * Why it's marked offline/Auto-generated
 * ──────────────────────────────────────
 * The title suffix and a `description` flag tell the user (and our analytics)
 * that this deck was assembled by the offline fallback rather than by the
 * Groq-hosted llama-3.3-70b. The flag also keeps it auditable: if a user
 * later asks "where did this deck come from?", the answer is right there.
 */

import type { GeneratedCard } from './groqService';

export interface GeneratedDeck {
  title: string;
  description: string;
  cards: GeneratedCard[];
}

/** Tag we set on every card so analytics can attribute "auto-generated" cards. */
export const OFFLINE_SOURCE = 'offline-template' as const;

const TEMPLATES: Array<{
  difficulty: 'easy' | 'medium' | 'hard';
  build: (topic: string) => { question: string; answer: string };
}> = [
  // ── easy / definitional ─────────────────────────────────────────────────
  {
    difficulty: 'easy',
    build: (t) => ({
      question: `What is ${t}?`,
      answer: `Define ${t} in your own words, then give one concrete example you have already seen.`,
    }),
  },
  {
    difficulty: 'easy',
    build: (t) => ({
      question: `Why is ${t} worth knowing about?`,
      answer: `State one practical reason a student should care about ${t}, plus one example from real life.`,
    }),
  },
  {
    difficulty: 'easy',
    build: (t) => ({
      question: `Name three sub-areas or topics inside ${t}.`,
      answer: `List three branches, sub-topics, or sub-skills that ${t} breaks down into.`,
    }),
  },

  // ── medium / application ───────────────────────────────────────────────
  {
    difficulty: 'medium',
    build: (t) => ({
      question: `How would you explain ${t} to a friend who has never heard of it?`,
      answer: `Write a 3-sentence plain-language summary a non-expert could understand.`,
    }),
  },
  {
    difficulty: 'medium',
    build: (t) => ({
      question: `What is one common misconception about ${t}?`,
      answer: `Identify a confusion beginners typically have about ${t} and explain why it is wrong.`,
    }),
  },
  {
    difficulty: 'medium',
    build: (t) => ({
      question: `Compare ${t} to a similar but different idea. What makes them distinct?`,
      answer: `Pick a peer concept, state how it overlaps with ${t}, and state the one key difference.`,
    }),
  },
  {
    difficulty: 'medium',
    build: (t) => ({
      question: `How would you apply ${t} to solve a real-world problem?`,
      answer: `Walk through a concrete scenario where using ${t} produces a better outcome than ignoring it.`,
    }),
  },

  // ── hard / synthesis ───────────────────────────────────────────────────
  {
    difficulty: 'hard',
    build: (t) => ({
      question: `Argue both for and against the importance of ${t} in 2 sentences each.`,
      answer: `Give a steelman "for" argument, then a steelman "against" argument — be honest about both.`,
    }),
  },
  {
    difficulty: 'hard',
    build: (t) => ({
      question: `If a beginner asked you "where do I start with ${t}?", what 3-step plan would you give them?`,
      answer: `Order the steps from least to most advanced, and justify the order.`,
    }),
  },
  {
    difficulty: 'hard',
    build: (t) => ({
      question: `What is the hardest question you can ask about ${t}, and what would a satisfying answer look like?`,
      answer: `Phrase an open-ended question about ${t} that does not have a single correct answer, then describe what a deep answer would cover.`,
    }),
  },
];

/**
 * Build a deterministic offline fallback deck for a topic.
 * Pure function — safe to call in tests, on the server, or in a worker.
 */
export function buildOfflineDeck(topic: string): GeneratedDeck {
  const cleaned = topic.trim() || 'General';

  return {
    title: `${cleaned} — Quick Study Set`,
    description:
      `An automatically generated starter deck on "${cleaned}". ` +
      'Created offline because the AI provider was unavailable — edit any card to add your own knowledge.',
    cards: TEMPLATES.map((tpl) => ({
      question: tpl.build(cleaned).question,
      answer: tpl.build(cleaned).answer,
      difficulty: tpl.difficulty,
      // Source attribution for analytics — NOT surfaced into the user-
      // facing `explanation`. The card-1 explanation used to read
      // "Auto-generated by the offline fallback…Edit me." which is producer
      // meta leaking into study content. A banner above the deck (driven
      // by `isOfflineDeck(generated)` on the page side) is the right
      // channel for that signal, not the answer text.
      source: OFFLINE_SOURCE,
    })),
  };
}

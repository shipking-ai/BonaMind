/**
 * The starter deck offered on an empty library.
 *
 * Activation, not filler. The two existing empty-state paths both cost the
 * user effort before they see anything work — authoring cards by hand, or
 * typing a topic and waiting on the generator. Neither reaches the voice
 * mode they signed up for. This deck is one tap from "study now".
 *
 * The subject is deliberately how memory works: the content explains why
 * the scheduler behaves as it does while the user experiences it, so the
 * first session teaches the product rather than just exercising it.
 *
 * Content constraints, because these cards get read aloud by TTS:
 *   - Questions are one sentence and end in a question mark, so the
 *     synthesiser applies rising intonation.
 *   - Answers are one or two sentences. Anything longer is unpleasant to
 *     hear and impossible to answer aloud from memory.
 *   - No parentheses, symbols, or notation — they read badly out loud.
 */

export const STARTER_DECK_TITLE = 'How memory works';

export const STARTER_DECK_DESCRIPTION =
  'Eight cards on the science behind spaced repetition. A two-minute first session.';

export interface StarterCardSeed {
  front: string;
  back: string;
}

export const STARTER_CARDS: StarterCardSeed[] = [
  {
    front: 'What is the forgetting curve?',
    back: 'The steady decline in how much you can recall as time passes since you last reviewed something.',
  },
  {
    front: 'Why is reviewing just before you forget the most efficient moment?',
    back: 'Recall takes real effort at that point, and the effort is what strengthens the memory. Reviewing too early costs time without adding much.',
  },
  {
    front: 'What does spaced repetition actually space out?',
    back: 'The gaps between reviews. Each successful recall earns a longer gap before the card returns.',
  },
  {
    front: 'What is the testing effect?',
    back: 'Retrieving an answer from memory strengthens it far more than re-reading the same material.',
  },
  {
    front: 'Why is answering out loud better than recognising the answer?',
    back: 'Producing an answer forces full retrieval. Recognising one only asks you to confirm something already in front of you.',
  },
  {
    front: 'What does stability mean in a scheduling algorithm?',
    back: 'How long a memory lasts before it needs review again. Every successful recall increases it.',
  },
  {
    front: 'What does difficulty mean for a single card?',
    back: 'How hard that specific fact is for you to retain. It adjusts as you review, so two people can have very different schedules for the same card.',
  },
  {
    front: 'Why does forgetting a card shorten its interval so sharply?',
    back: 'A lapse shows the memory was weaker than estimated, so the card comes back soon to rebuild it before it disappears entirely.',
  },
];

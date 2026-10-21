import { describe, expect, it } from 'vitest';
import { buildConceptWeaknesses, cardLapses, extractConceptTerms } from '../lib/conceptModel';
import type { Card, Deck } from '../types';

function card(id: string, front: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    front,
    back: 'back',
    deckId: 'd1',
    nextReview: Date.now() + 1000,
    interval: 1,
    easeFactor: 2.5,
    repetition: 1,
    ...overrides,
  };
}

const decks: Deck[] = [
  { id: 'd1', title: 'Cell Biology', description: '', createdAt: 0, cardCount: 0 },
];

describe('cardLapses', () => {
  it('prefers the top-level lapses column', () => {
    expect(cardLapses(card('a', 'x', { lapses: 4, fsrsState: { lapses: 2, stability: 1, difficulty: 5, elapsedDays: 1, scheduledDays: 1, repetitions: 3, lastReview: 0 } }))).toBe(4);
  });

  it('falls back to fsrsState.lapses', () => {
    expect(cardLapses(card('a', 'x', { fsrsState: { lapses: 3, stability: 1, difficulty: 5, elapsedDays: 1, scheduledDays: 1, repetitions: 3, lastReview: 0 } }))).toBe(3);
  });

  it('returns 0 when neither is set', () => {
    expect(cardLapses(card('a', 'x'))).toBe(0);
  });
});

describe('extractConceptTerms', () => {
  it('extracts meaningful terms and drops stopwords', () => {
    const terms = extractConceptTerms('What powers ATP synthase in the mitochondria?');
    expect(terms).toContain('atp');
    expect(terms).toContain('synthase');
    expect(terms).toContain('mitochondria');
    expect(terms).not.toContain('what');
    expect(terms).not.toContain('the');
  });

  it('keeps multi-word compounds', () => {
    const terms = extractConceptTerms('Where does the Calvin cycle happen?');
    expect(terms).toContain('calvin cycle');
  });

  it('drops generic words like cycle', () => {
    const terms = extractConceptTerms('Explain the Krebs cycle');
    expect(terms).not.toContain('cycle');
  });
});

describe('buildConceptWeaknesses', () => {
  it('returns [] when no cards have lapsed twice', () => {
    const cards = [
      card('a', 'What is ATP synthase?', { lapses: 1 }),
      card('b', 'Define osmosis', { lapses: 0 }),
    ];
    expect(buildConceptWeaknesses(cards, decks)).toEqual([]);
  });

  it('groups weak cards by shared concept terms and ranks by lapses', () => {
    const cards = [
      card('a', 'What powers ATP synthase?', { lapses: 3 }),
      card('b', 'Where is ATP synthase located?', { lapses: 2 }),
      card('c', 'Define osmosis', { lapses: 2 }),
    ];
    const result = buildConceptWeaknesses(cards, decks);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const atp = result.find((r) => r.concept.includes('synthase') || r.concept.includes('atp'));
    expect(atp).toBeDefined();
    expect(atp!.weakCardCount).toBe(2);
    expect(atp!.totalLapses).toBe(5);
    // ranked first by total lapses
    expect(result[0].totalLapses).toBeGreaterThanOrEqual(result[1].totalLapses);
  });

  it('reports average difficulty when available', () => {
    const cards = [
      card('a', 'What powers ATP synthase?', {
        lapses: 3,
        fsrsState: { lapses: 3, stability: 2, difficulty: 8, elapsedDays: 1, scheduledDays: 1, repetitions: 3, lastReview: 0 },
      }),
      card('b', 'Where is ATP synthase located?', {
        lapses: 2,
        fsrsState: { lapses: 2, stability: 2, difficulty: 6, elapsedDays: 1, scheduledDays: 1, repetitions: 2, lastReview: 0 },
      }),
    ];
    const result = buildConceptWeaknesses(cards, decks);
    const atp = result.find((r) => r.concept.includes('synthase') || r.concept.includes('atp'));
    expect(atp!.avgDifficulty).toBeCloseTo(7, 5);
  });

  it('falls back to deck-title grouping when no terms extract', () => {
    const cards = [
      card('a', 'a', { lapses: 4 }),
      card('b', 'b', { lapses: 3 }),
    ];
    const result = buildConceptWeaknesses(cards, decks);
    expect(result.length).toBe(1);
    expect(result[0].concept).toBe('Cell Biology');
    expect(result[0].weakCardCount).toBe(2);
    expect(result[0].totalLapses).toBe(7);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { STARTER_CARDS, STARTER_DECK_TITLE } from '../data/starterDeck';

vi.mock('../services/database/dbService', () => ({
  dbService: {
    createDeck: vi.fn(async (_userId: string, title: string) => ({ id: 'deck-1', title })),
    saveCards: vi.fn(async (_userId: string, cards: unknown[]) => cards),
  },
}));

const { createStarterDeck } = await import('../services/decks/starterDeckService');
const { dbService } = await import('../services/database/dbService');

describe('starter deck content', () => {
  it('is short enough to finish in one sitting', () => {
    // The empty state promises "about two minutes". More cards than this and
    // the first session stops being a two-minute commitment.
    expect(STARTER_CARDS.length).toBeGreaterThanOrEqual(5);
    expect(STARTER_CARDS.length).toBeLessThanOrEqual(10);
  });

  it('phrases every prompt as a question so TTS intonation is right', () => {
    for (const card of STARTER_CARDS) {
      expect(card.front.trim().endsWith('?')).toBe(true);
    }
  });

  it('keeps answers short enough to hear and to say back', () => {
    for (const card of STARTER_CARDS) {
      expect(card.back.length).toBeLessThanOrEqual(190);
      expect(card.back.trim().length).toBeGreaterThan(0);
    }
  });

  it('avoids characters that read badly aloud', () => {
    for (const card of STARTER_CARDS) {
      const text = `${card.front} ${card.back}`;
      expect(text).not.toMatch(/[()[\]{}<>|*_#]/);
    }
  });

  it('has no duplicate prompts', () => {
    const fronts = STARTER_CARDS.map((c) => c.front.toLowerCase());
    expect(new Set(fronts).size).toBe(fronts.length);
  });
});

describe('createStarterDeck', () => {
  it('creates the deck then seeds every card against it', async () => {
    const { deck, cards } = await createStarterDeck('user-1');

    expect(dbService.createDeck).toHaveBeenCalledWith(
      'user-1',
      STARTER_DECK_TITLE,
      expect.any(String),
    );
    expect(deck.id).toBe('deck-1');
    expect(cards).toHaveLength(STARTER_CARDS.length);
  });

  it('points every seeded card at the new deck and makes it due now', async () => {
    const { cards } = await createStarterDeck('user-1');

    for (const card of cards as Array<{ deckId: string; nextReview?: number }>) {
      expect(card.deckId).toBe('deck-1');
      // Seeded cards must enter the scheduler like any other new card:
      // due immediately, so the first session has something to show.
      expect(card.nextReview).toBeLessThanOrEqual(Date.now());
    }
  });
});

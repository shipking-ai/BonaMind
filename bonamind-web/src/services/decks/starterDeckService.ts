import type { Card, Deck } from '../../types';
import { dbService } from '../database/dbService';
import { getInitialCardState } from '../study/srs';
import {
  STARTER_CARDS,
  STARTER_DECK_DESCRIPTION,
  STARTER_DECK_TITLE,
} from '../../data/starterDeck';

/**
 * Creates the starter deck for a user with an empty library.
 *
 * Cards are built through `getInitialCardState` rather than hand-rolled so
 * they enter the scheduler exactly like any generated card — same FSRS
 * initial state, same due-now semantics. A seeded deck that bypassed that
 * would behave subtly differently from every other deck the user makes.
 */
export async function createStarterDeck(
  userId: string,
): Promise<{ deck: Deck; cards: Card[] }> {
  const deck = await dbService.createDeck(
    userId,
    STARTER_DECK_TITLE,
    STARTER_DECK_DESCRIPTION,
  );

  const seeded: Partial<Card>[] = STARTER_CARDS.map((seed) => ({
    ...getInitialCardState(deck.id, seed.front, seed.back),
    deckId: deck.id,
  }));

  const cards = await dbService.saveCards(userId, seeded);
  return { deck, cards };
}

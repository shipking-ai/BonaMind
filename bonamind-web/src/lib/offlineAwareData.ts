import type { Card, Deck } from "../types";

export interface OfflineAwareDataDeps {
  online: boolean;
  offlineMode: boolean;
  autoSync: boolean;
  getCachedDecks: (userId: string) => Promise<Deck[]>;
  getCachedCards: (deckId: string) => Promise<Card[]>;
  fetchDecks: (userId: string) => Promise<Deck[]>;
  fetchCards: (userId: string) => Promise<Card[]>;
  /** Optional: refresh the offline cache after a successful network fetch. */
  cacheDeck?: (userId: string, deck: Deck, cards: Card[]) => Promise<void>;
  /** Optional: run a pre-fetch sync (e.g. syncCurrentUser) while online. */
  syncUser?: () => Promise<unknown>;
}

export interface OfflineAwareDataResult {
  decks: Deck[];
  cards: Card[];
}

/**
 * Single source of truth for "cache vs network vs fallback" when loading a
 * user's decks and cards.
 *
 * Decision matrix:
 *   - read cache when offline OR in offline mode
 *   - reach for the network only while online, and only when offline mode is
 *     off or the cache came back empty
 *   - fall back to cache when a network fetch rejects, instead of throwing
 */
export async function loadOfflineAwareData(
  userId: string,
  deps: OfflineAwareDataDeps,
): Promise<OfflineAwareDataResult> {
  let decks: Deck[] = [];
  let cards: Card[] = [];

  const loadCached = async () => {
    try {
      decks = await deps.getCachedDecks(userId);
      cards = (await Promise.all(decks.map((deck) => deps.getCachedCards(deck.id)))).flat();
    } catch {
      decks = [];
      cards = [];
    }
  };

  if (deps.offlineMode || !deps.online) {
    await loadCached();
  }

  if (deps.online && (!deps.offlineMode || decks.length === 0)) {
    try {
      if (!deps.offlineMode) await deps.syncUser?.();
      [decks, cards] = await Promise.all([deps.fetchDecks(userId), deps.fetchCards(userId)]);

      if (deps.autoSync && deps.cacheDeck) {
        await Promise.all(
          decks.map(async (deck) => {
            try {
              await deps.cacheDeck!(
                userId,
                deck,
                cards.filter((card) => card.deckId === deck.id),
              );
            } catch {
              // Caching is best effort and must not block login.
            }
          }),
        );
      }
    } catch {
      await loadCached();
    }
  }

  return { decks, cards };
}

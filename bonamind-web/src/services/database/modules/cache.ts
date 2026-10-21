import { Card, Deck } from '../../../types';

// Caching layer to avoid refecthing on navigation switch
export let cachedDecks: Deck[] | null = null;
export let cachedCards: Card[] | null = null;
export let lastOwnerId: string | null = null;

export const setCachedDecks = (decks: Deck[] | null) => { cachedDecks = decks; };
export const setCachedCards = (cards: Card[] | null) => { cachedCards = cards; };
export const setLastOwnerId = (id: string | null) => { lastOwnerId = id; };

export const clearCache = () => {
    cachedDecks = null;
    cachedCards = null;
    lastOwnerId = null;
};




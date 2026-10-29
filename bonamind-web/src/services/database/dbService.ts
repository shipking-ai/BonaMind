import { deckService } from './modules/deckService';
import { cardService } from './modules/cardService';
import { sessionService } from './modules/sessionService';
import { clearCache } from './modules/cache';

export const dbService = {
    // --- CACHE MGMT ---
    clearCache,

    // --- DECKS ---
    ...deckService,

    // --- CARDS ---
    ...cardService,

    // --- STUDY SESSIONS ---
    ...sessionService
};




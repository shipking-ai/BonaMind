/**
 * Offline Study Service
 * 
 * Enables studying flashcards without an internet connection.
 * Uses IndexedDB for persistent local storage of decks and cards.
 * Syncs progress when connection is restored.
 */

import { Card, Deck } from '../../types';
import { openOfflineDb } from './offlineDb';
import { buildUpdatePayload } from '../database/modules/cardService';
import { clearCache } from '../database/modules/cache';

const DAY_MS = 86_400_000;

/**
 * Postgres codes the record_card_review RPC raises for a review that can
 * never succeed: card deleted (P0002), card or review not the caller's
 * (42501), out-of-range rating (22000). Retrying those forever would keep
 * the item in the queue for good, so they are dropped instead.
 */
const PERMANENT_SYNC_ERRORS = new Set(['P0002', '42501', '22000']);

const DECKS_STORE = 'decks';
const CARDS_STORE = 'cards';
const SYNC_QUEUE_STORE = 'syncQueue';

interface SyncQueueItem {
  id: string;
  type: 'card_review' | 'card_create' | 'card_update' | 'card_delete';
  data: any;
  timestamp: number;
  retryCount: number;
}

interface _OfflineDB {
  decks: IDBObjectStore;
  cards: IDBObjectStore;
  syncQueue: IDBObjectStore;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openOfflineDb();
  return dbPromise;
}

/**
 * Cache a deck and its cards for offline use
 */
export async function cacheDeckForOffline(userId: string, deck: Deck, cards: Card[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([DECKS_STORE, CARDS_STORE], 'readwrite');

  // Store deck metadata
  const deckStore = tx.objectStore(DECKS_STORE);
  await deckStore.put({
    ...deck,
    userId,
    cachedAt: Date.now(),
  });

  // Store all cards
  const cardsStore = tx.objectStore(CARDS_STORE);
  for (const card of cards) {
    await cardsStore.put({
      ...card,
      userId,
      cachedAt: Date.now(),
    });
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get cached decks for offline use
 */
export async function getCachedDecks(userId: string): Promise<Deck[]> {
  const db = await openDB();
  const tx = db.transaction(DECKS_STORE, 'readonly');
  const store = tx.objectStore(DECKS_STORE);
  const index = store.index('userId');
  const request = index.getAll(userId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get cached cards for a specific deck
 */
export async function getCachedCards(deckId: string): Promise<Card[]> {
  const db = await openDB();
  const tx = db.transaction(CARDS_STORE, 'readonly');
  const store = tx.objectStore(CARDS_STORE);
  const index = store.index('deckId');
  const request = index.getAll(deckId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get due cards from cached data
 */
export async function getDueCardsOffline(deckId: string): Promise<Card[]> {
  const cards = await getCachedCards(deckId);
  const now = Date.now();
  return cards.filter(card => (card.nextReview ?? 0) <= now);
}

/**
 * Queue a card review for sync when online.
 *
 * `reviewedAt` should be the same timestamp the caller writes as
 * lastReviewed and sends to the review history, so a replay lands on the
 * same (user_id, card_id, reviewed_at) row instead of duplicating it.
 * `userId` keeps one account's queued reviews from being replayed under
 * another account on a shared device.
 */
export async function queueCardReview(
  cardId: string,
  rating: number,
  srsResult: any,
  opts: { userId?: string | null; reviewedAt?: number } = {},
): Promise<void> {
  const reviewedAt = opts.reviewedAt ?? Date.now();
  const db = await openDB();
  const tx = db.transaction([CARDS_STORE, SYNC_QUEUE_STORE], 'readwrite');

  // Update local card
  const cardsStore = tx.objectStore(CARDS_STORE);
  const cardRequest = cardsStore.get(cardId);

  cardRequest.onsuccess = () => {
    const card = cardRequest.result;
    if (card) {
      cardsStore.put({
        ...card,
        interval: srsResult.interval,
        easeFactor: srsResult.easeFactor,
        repetition: srsResult.repetition,
        nextReview: reviewedAt + srsResult.interval * DAY_MS,
        lastReviewed: reviewedAt,
        fsrsState: srsResult.fsrsState || card.fsrsState,
      });
    }
  };

  // Add to sync queue
  const syncStore = tx.objectStore(SYNC_QUEUE_STORE);
  await syncStore.put({
    id: `${cardId}_${reviewedAt}`,
    type: 'card_review',
    data: { cardId, rating, srsResult, userId: opts.userId ?? null },
    timestamp: reviewedAt,
    retryCount: 0,
  });

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get pending sync items
 */
export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  const db = await openDB();
  const tx = db.transaction(SYNC_QUEUE_STORE, 'readonly');
  const store = tx.objectStore(SYNC_QUEUE_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear a sync item after successful sync
 */
export async function clearSyncItem(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
  await tx.objectStore(SYNC_QUEUE_STORE).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Clear all cached data for a user
 */
export async function clearOfflineCache(userId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([DECKS_STORE, CARDS_STORE, SYNC_QUEUE_STORE], 'readwrite');

  // Clear decks
  const decksStore = tx.objectStore(DECKS_STORE);
  const deckIndex = decksStore.index('userId');
  const deckRequest = deckIndex.openCursor(userId);

  deckRequest.onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };

  // Clear cards
  const cardsStore = tx.objectStore(CARDS_STORE);
  const cardIndex = cardsStore.index('userId');
  const cardRequest = cardIndex.openCursor(userId);

  cardRequest.onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };

  // Clear this user's queued reviews only — another account's unsynced
  // reviews on the same device exist nowhere else.
  const syncRequest = tx.objectStore(SYNC_QUEUE_STORE).openCursor();
  syncRequest.onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
    if (cursor) {
      if (cursor.value?.data?.userId === userId) cursor.delete();
      cursor.continue();
    }
  };

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function bumpRetryCount(item: SyncQueueItem): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
  tx.objectStore(SYNC_QUEUE_STORE).put({ ...item, retryCount: (item.retryCount ?? 0) + 1 });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Replay one queued review: the history row first, then the card's schedule.
 *
 * The schedule write is what makes an offline session count. Recording only
 * the history row (as this used to) left `cards.next_review` at its old
 * value, so every card studied offline came back due on the next load.
 * The update is guarded on last_reviewed, the same rule the native app uses
 * (packages/core pushReview): a review that reached the server from another
 * device after this one was made is never overwritten by the older replay.
 */
async function syncCardReview(supabase: any, item: SyncQueueItem): Promise<void> {
  const reviewedAt = item.timestamp ?? Date.now();
  const reviewedAtIso = new Date(reviewedAt).toISOString();
  const srsResult = item.data.srsResult ?? {};

  // Replay the ORIGINAL review timestamp: it is stable across retries, so a
  // re-flush after a partial failure hits the (user_id, card_id, reviewed_at)
  // idempotency key and no-ops instead of duplicating the review.
  const { error: rpcError } = await supabase.rpc('record_card_review', {
    p_card_id: item.data.cardId,
    p_rating: item.data.rating,
    p_srs_result: srsResult,
    p_srs_algorithm: item.data.srsAlgorithm ?? 'fsrs',
    p_reviewed_at: reviewedAtIso,
    // p_user_id omitted — the RPC fills it from auth.uid().
  });
  if (rpcError) throw rpcError;

  // Items queued before the schedule fields were captured have nothing to
  // apply; the history row above is all they carry.
  if (typeof srsResult.interval !== 'number' || !Number.isFinite(srsResult.interval)) return;

  const payload = buildUpdatePayload({
    interval: srsResult.interval,
    repetition: srsResult.repetition,
    easeFactor: srsResult.easeFactor,
    nextReview: reviewedAt + srsResult.interval * DAY_MS,
    lastReviewed: reviewedAt,
    ...(srsResult.fsrsState ? { fsrsState: srsResult.fsrsState } : {}),
  });
  const { error: updateError } = await supabase
    .from('cards')
    .update(payload)
    .eq('id', item.data.cardId)
    .or(`last_reviewed.is.null,last_reviewed.lt.${reviewedAtIso}`);
  if (updateError) throw updateError;
}

let syncInFlight: Promise<{ synced: number; failed: number; dropped: number }> | null = null;

/**
 * Sync all queued offline data to Supabase.
 *
 * Needs a signed-in session: without one the RPC rejects every review as
 * "anonymous" (42501), which would read as a permanent failure and drop the
 * queue. Items another account queued on this device are left for that
 * account to sync.
 */
export function syncOfflineData(): Promise<{ synced: number; failed: number; dropped: number }> {
  if (!syncInFlight) {
    syncInFlight = runSync().finally(() => {
      syncInFlight = null;
    });
  }
  return syncInFlight;
}

async function runSync(): Promise<{ synced: number; failed: number; dropped: number }> {
  const result = { synced: 0, failed: 0, dropped: 0 };
  const items = await getPendingSyncItems();
  if (items.length === 0) return result;

  const { supabase } = await import('../database/supabase');
  if (!supabase) return result;
  const { data } = await supabase.auth.getSession();
  const currentUserId = data.session?.user?.id;
  if (!currentUserId) return result;

  // Oldest first, so when one card was reviewed twice offline the later
  // review is the schedule that sticks.
  const ordered = [...items].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  for (const item of ordered) {
    const owner = item.data?.userId;
    if (owner && owner !== currentUserId) continue;
    try {
      if (item.type === 'card_review') {
        await syncCardReview(supabase, item);
      }
      await clearSyncItem(item.id);
      result.synced++;
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code && PERMANENT_SYNC_ERRORS.has(code)) {
        console.warn(`[Sync] Dropping queued review for card ${String(item.data?.cardId).slice(0, 8)}… (${code})`);
        await clearSyncItem(item.id).catch(() => undefined);
        result.dropped++;
      } else {
        await bumpRetryCount(item).catch(() => undefined);
        result.failed++;
      }
    }
  }

  // The in-memory deck/card cache still holds the pre-sync schedule.
  if (result.synced > 0) clearCache();
  return result;
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Sync again shortly. Used when a review failed to save while the device was
 * online: no `online` event will fire to trigger the normal sync.
 */
export function scheduleOfflineSync(delayMs = 30_000): void {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (isOnline()) void syncOfflineData();
  }, delayMs);
}

/**
 * Check if app is online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Listen for online/offline events
 */
export function onConnectionChange(
  onOnline: () => void,
  onOffline: () => void
): () => void {
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}

/**
 * Get offline cache stats
 */
export async function getOfflineStats(): Promise<{
  decksCached: number;
  cardsCached: number;
  pendingSyncs: number;
  lastSync: number | null;
}> {
  const db = await openDB();

  // Count decks
  const deckTx = db.transaction(DECKS_STORE, 'readonly');
  const deckCountRequest = deckTx.objectStore(DECKS_STORE).count();
  const deckCount = await new Promise<number>((resolve, reject) => {
    deckCountRequest.onsuccess = () => resolve(deckCountRequest.result);
    deckCountRequest.onerror = () => reject(deckCountRequest.error);
  });

  // Count cards
  const cardTx = db.transaction(CARDS_STORE, 'readonly');
  const cardCountRequest = cardTx.objectStore(CARDS_STORE).count();
  const cardCount = await new Promise<number>((resolve, reject) => {
    cardCountRequest.onsuccess = () => resolve(cardCountRequest.result);
    cardCountRequest.onerror = () => reject(cardCountRequest.error);
  });

  // Count pending syncs
  const syncTx = db.transaction(SYNC_QUEUE_STORE, 'readonly');
  const syncCountRequest = syncTx.objectStore(SYNC_QUEUE_STORE).count();
  const syncCount = await new Promise<number>((resolve, reject) => {
    syncCountRequest.onsuccess = () => resolve(syncCountRequest.result);
    syncCountRequest.onerror = () => reject(syncCountRequest.error);
  });

  return {
    decksCached: deckCount,
    cardsCached: cardCount,
    pendingSyncs: syncCount,
    lastSync: null, // Could be stored in a separate metadata store
  };
}




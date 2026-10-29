import { describe, expect, it, vi } from "vitest";
import { loadOfflineAwareData, type OfflineAwareDataDeps } from "../lib/offlineAwareData";
import type { Card, Deck } from "../types";

const deck = (id: string): Deck => ({
  id,
  title: id,
  description: "",
  createdAt: 0,
  cardCount: 1,
});

const card = (id: string, deckId: string): Card => ({
  id,
  deckId,
  front: id,
  back: "",
  interval: 0,
  easeFactor: 2.5,
  repetition: 0,
  nextReview: 0,
  lastReviewed: undefined,
});

function makeDeps(overrides: Partial<OfflineAwareDataDeps> = {}) {
  const d = {
    online: true,
    offlineMode: false,
    autoSync: true,
    getCachedDecks: vi.fn(async (_userId: string): Promise<Deck[]> => []),
    getCachedCards: vi.fn(async (_deckId: string): Promise<Card[]> => []),
    fetchDecks: vi.fn(async (_userId: string): Promise<Deck[]> => []),
    fetchCards: vi.fn(async (_userId: string): Promise<Card[]> => []),
    cacheDeck: vi.fn(
      async (_userId: string, _deck: Deck, _cards: Card[]): Promise<void> => undefined,
    ),
    syncUser: vi.fn(async (): Promise<void> => undefined),
  };
  Object.assign(d, overrides);
  return d;
}

describe("loadOfflineAwareData", () => {
  it("online + normal mode: fetches network, syncs user, and refreshes cache", async () => {
    const d = makeDeps({
      fetchDecks: vi.fn(async () => [deck("d1")]),
      fetchCards: vi.fn(async () => [card("c1", "d1")]),
    });

    const result = await loadOfflineAwareData("u1", d);

    expect(d.syncUser).toHaveBeenCalledTimes(1);
    expect(d.fetchDecks).toHaveBeenCalledWith("u1");
    expect(d.fetchCards).toHaveBeenCalledWith("u1");
    expect(d.cacheDeck).toHaveBeenCalledTimes(1);
    expect(d.cacheDeck).toHaveBeenCalledWith("u1", deck("d1"), [card("c1", "d1")]);
    expect(d.getCachedDecks).not.toHaveBeenCalled();
    expect(result.decks).toHaveLength(1);
    expect(result.cards).toHaveLength(1);
  });

  it("offline: reads cache and NEVER touches the network or sync", async () => {
    const d = makeDeps({
      online: false,
      getCachedDecks: vi.fn(async () => [deck("d1")]),
      getCachedCards: vi.fn(async () => [card("c1", "d1")]),
    });

    const result = await loadOfflineAwareData("u1", d);

    expect(result.decks).toHaveLength(1);
    expect(result.cards).toHaveLength(1);
    expect(d.fetchDecks).not.toHaveBeenCalled();
    expect(d.fetchCards).not.toHaveBeenCalled();
    expect(d.syncUser).not.toHaveBeenCalled();
    expect(d.cacheDeck).not.toHaveBeenCalled();
  });

  it("offline + no cache: returns empty without throwing", async () => {
    const d = makeDeps({ online: false });

    const result = await loadOfflineAwareData("u1", d);

    expect(result.decks).toHaveLength(0);
    expect(result.cards).toHaveLength(0);
    expect(d.fetchDecks).not.toHaveBeenCalled();
  });

  it("offline mode (online) + warm cache: prefers cache, skips network", async () => {
    const d = makeDeps({
      offlineMode: true,
      getCachedDecks: vi.fn(async () => [deck("d1")]),
      getCachedCards: vi.fn(async () => [card("c1", "d1")]),
    });

    const result = await loadOfflineAwareData("u1", d);

    expect(result.decks).toHaveLength(1);
    expect(d.fetchDecks).not.toHaveBeenCalled();
    expect(d.syncUser).not.toHaveBeenCalled();
  });

  it("offline mode (online) + empty cache: falls through to network and refreshes cache", async () => {
    const d = makeDeps({
      offlineMode: true,
      fetchDecks: vi.fn(async () => [deck("d1")]),
      fetchCards: vi.fn(async () => [card("c1", "d1")]),
    });

    const result = await loadOfflineAwareData("u1", d);

    expect(result.decks).toHaveLength(1);
    expect(d.fetchDecks).toHaveBeenCalledTimes(1);
    expect(d.cacheDeck).toHaveBeenCalledTimes(1);
    expect(d.syncUser).not.toHaveBeenCalled();
  });

  it("online + network failure: falls back to cache instead of throwing", async () => {
    const d = makeDeps({
      fetchDecks: vi.fn(async () => {
        throw new Error("network down");
      }),
      getCachedDecks: vi.fn(async () => [deck("d1")]),
      getCachedCards: vi.fn(async () => [card("c1", "d1")]),
    });

    const result = await loadOfflineAwareData("u1", d);

    expect(result.decks).toHaveLength(1);
    expect(result.cards).toHaveLength(1);
  });

  it("online + network failure + no cache: returns empty without throwing", async () => {
    const d = makeDeps({
      fetchDecks: vi.fn(async () => {
        throw new Error("network down");
      }),
    });

    const result = await loadOfflineAwareData("u1", d);

    expect(result.decks).toHaveLength(0);
    expect(result.cards).toHaveLength(0);
  });

  it("autoSync off: fetches network but does not refresh cache", async () => {
    const d = makeDeps({
      autoSync: false,
      fetchDecks: vi.fn(async () => [deck("d1")]),
      fetchCards: vi.fn(async () => [card("c1", "d1")]),
    });

    await loadOfflineAwareData("u1", d);

    expect(d.fetchDecks).toHaveBeenCalledTimes(1);
    expect(d.cacheDeck).not.toHaveBeenCalled();
  });

  it("a failing cacheDeck is swallowed and does not fail the load", async () => {
    const d = makeDeps({
      fetchDecks: vi.fn(async () => [deck("d1"), deck("d2")]),
      fetchCards: vi.fn(async () => [card("c1", "d1"), card("c2", "d2")]),
      cacheDeck: vi.fn(async (userId: string, target: Deck) => {
        if (target.id === "d1") throw new Error("quota");
      }),
    });

    const result = await loadOfflineAwareData("u1", d);

    expect(result.decks).toHaveLength(2);
    expect(d.cacheDeck).toHaveBeenCalledTimes(2);
  });
});

import { describe, expect, it } from "vitest";

import { calculateSRS, getInitialCardState } from "../services/study/srs";
import { Rating } from "../types";

describe("srs helpers", () => {
  it("creates a new card in the expected initial review state", () => {
    const card = getInitialCardState("deck-1", "Question?", "Answer.");

    expect(card.deckId).toBe("deck-1");
    expect(card.front).toBe("Question?");
    expect(card.back).toBe("Answer.");
    expect(card.interval).toBe(0);
    expect(card.repetition).toBe(0);
    expect(card.easeFactor).toBe(2.5);
  });

  it("advances repetition and interval after a successful review", () => {
    const card = getInitialCardState("deck-1", "Question?", "Answer.");
    const result = calculateSRS(card, Rating.GOOD);

    expect(result.interval).toBeGreaterThanOrEqual(1);
    expect(result.repetition).toBe(1);
    expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it("honors the target-retention preference when scheduling a mature card", () => {
    const lastReview = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const card = {
      ...getInitialCardState("deck-1", "Question?", "Answer."),
      repetition: 4,
      interval: 14,
      lastReviewed: lastReview,
      fsrsState: {
        stability: 30,
        difficulty: 5,
        elapsedDays: 10,
        scheduledDays: 14,
        repetitions: 4,
        lapses: 0,
        lastReview,
      },
    };

    const conservative = calculateSRS(card, Rating.GOOD, undefined, 0.9);
    const aggressive = calculateSRS(card, Rating.GOOD, undefined, 0.8);

    expect(aggressive.interval).toBeGreaterThanOrEqual(conservative.interval);
  });
});

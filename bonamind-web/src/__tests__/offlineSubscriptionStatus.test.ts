import { beforeEach, describe, expect, it } from "vitest";
import {
  SUBSCRIPTION_STATUS_KEY,
  readStoredSubscriptionStatus,
  storeSubscriptionStatus,
  subscriptionFallback,
} from "../lib/offlineSubscriptionStatus";

describe("offlineSubscriptionStatus", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing is stored", () => {
    expect(readStoredSubscriptionStatus()).toBeNull();
  });

  it("round-trips a valid status", () => {
    storeSubscriptionStatus("trialing");
    expect(readStoredSubscriptionStatus()).toBe("trialing");
  });

  it("ignores garbage stored under the key", () => {
    localStorage.setItem(SUBSCRIPTION_STATUS_KEY, "not-a-status");
    expect(readStoredSubscriptionStatus()).toBeNull();
  });

  it("falls back to the last known status when offline", () => {
    storeSubscriptionStatus("active");
    expect(subscriptionFallback(false)).toBe("active");
  });

  it("grants an offline grace when offline with no history", () => {
    expect(subscriptionFallback(false)).toBe("active");
  });

  it("does not grant free access when online with no history", () => {
    expect(subscriptionFallback(true)).toBe("none");
  });

  it('prefers a stored "canceled" status even while offline', () => {
    storeSubscriptionStatus("canceled");
    expect(subscriptionFallback(false)).toBe("canceled");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { toastErrorSpy } = vi.hoisted(() => ({ toastErrorSpy: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: toastErrorSpy } }));

import { classifyError, errorMessage, toastError } from "../lib/errorToast";

beforeEach(() => {
  toastErrorSpy.mockClear();
});

describe("classifyError / errorMessage", () => {
  it("maps AIRouterError.auth_required to an actionable provider message", () => {
    const msg = errorMessage(
      { code: "auth_required", triedProviders: ["puter"], message: "puter: auth required" },
      "fallback",
    );
    expect(msg).toContain("free AI provider");
  });

  it("maps AIRouterError.all_providers_failed (the default)", () => {
    const msg = errorMessage(
      { code: "all_providers_failed", triedProviders: ["puter", "webllm"], message: "all failed" },
      "fallback",
    );
    expect(msg).toContain("free AI provider");
  });

  it("prefers the SpeechError's student-facing message verbatim", () => {
    const friendly = "I didn't catch that — tap to answer again.";
    const msg = errorMessage(
      { code: "no-speech", needsPermission: false, message: friendly },
      "fallback",
    );
    expect(msg).toBe(friendly);
  });

  it("maps CardReviewConstraintError to a progress-safe message", () => {
    const msg = errorMessage(
      { name: "CardReviewConstraintError", provider: "cardReviews", code: "23514" },
      "fallback",
    );
    expect(msg).toContain("progress is kept");
  });

  it("maps RateLimitError using its retryAfter", () => {
    const msg = errorMessage({ name: "RateLimitError", retryAfter: 3.2 }, "fallback");
    expect(msg).toMatch(/try again in \d+s/);
    expect(msg).not.toContain("fallback");
  });

  it("distinguishes Groq auth vs quota", () => {
    const auth = errorMessage(
      { name: "GroqUnavailableError", provider: "groq", isAuthFailure: true },
      "f",
    );
    const quota = errorMessage(
      { name: "GroqUnavailableError", provider: "groq", isQuotaExhausted: true },
      "f",
    );
    expect(auth).toContain("key was rejected");
    expect(quota).toContain("quota reached");
  });

  it("maps PuterAuthError", () => {
    const msg = errorMessage({ name: "PuterAuthError" }, "fallback");
    expect(msg).toContain("Sign in to Puter");
  });

  it("falls back to Error.message for unknown errors", () => {
    const msg = errorMessage(new Error("network down"), "fallback");
    expect(msg).toBe("network down");
  });

  it("falls back to the caller string for non-Error values", () => {
    expect(errorMessage("boom", "fallback")).toBe("fallback");
    expect(errorMessage(undefined, "fallback")).toBe("fallback");
    expect(errorMessage(new Error("  "), "fallback")).toBe("fallback");
  });

  it("returns null from classifyError for unrecognised shapes", () => {
    expect(classifyError({ code: 22 })).toBeNull();
    expect(classifyError("string")).toBeNull();
    expect(classifyError(null)).toBeNull();
  });
});

describe("toastError", () => {
  it("routes the resolved message into sonner's error toast", () => {
    toastError({ code: "quota", triedProviders: ["puter"] }, "fallback");
    expect(toastErrorSpy).toHaveBeenCalledWith(expect.stringContaining("free AI limit"));
  });

  it("uses the caller fallback when the error is unrecognised", () => {
    toastError("boom", "Could not save this deck.");
    expect(toastErrorSpy).toHaveBeenCalledWith("Could not save this deck.");
  });
});

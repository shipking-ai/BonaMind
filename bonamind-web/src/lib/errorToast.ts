import { toast } from "sonner";

/**
 * errorToast — a single consumer for the app's typed errors.
 *
 * The codebase already throws rich, typed errors (AIRouterError, SpeechError,
 * CardReviewConstraintError, RateLimitError, GroqUnavailableError, and the
 * Puter*Error family), but the UI flattened every one of them with
 * `error instanceof Error ? error.message : fallback`. That surfaces raw,
 * developer-facing text (or no text) to a student mid-flow.
 *
 * This module is the fix: it recognises each known error by SHAPE (duck
 * typing), not by `instanceof`, so it stays free of the service modules'
 * import graphs (no supabase client init, no circular imports) and keeps
 * working even if an error crosses a boundary. Unknown errors still fall back
 * to `Error.message`, then to the caller-supplied fallback.
 */

export type KnownErrorKind =
  | "ai-router"
  | "speech"
  | "card-review"
  | "rate-limit"
  | "groq"
  | "puter-auth";

export interface ClassifiedError {
  kind: KnownErrorKind;
  message: string;
}

/** AIRouterError.code union (services/ai/freeAIRouter.ts). */
const AI_ROUTER_CODES = new Set([
  "all_providers_failed",
  "user_aborted",
  "quota",
  "auth_required",
]);

/** SpeechError.code union (services/voice/speechEngine.ts). */
const SPEECH_CODES = new Set([
  "not-allowed",
  "no-speech",
  "audio-capture",
  "network",
  "aborted",
  "service-not-allowed",
  "unsupported",
  "unknown",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Classify a thrown value into a known error kind, or null if unrecognised. */
export function classifyError(error: unknown): ClassifiedError | null {
  if (!isRecord(error)) return null;

  // AIRouterError — a `code` from its union plus a `triedProviders` array.
  if (
    typeof error.code === "string" &&
    AI_ROUTER_CODES.has(error.code) &&
    Array.isArray(error.triedProviders)
  ) {
    switch (error.code) {
      case "auth_required":
        return {
          kind: "ai-router",
          message: "Connect a free AI provider to continue — Settings → AI Provider.",
        };
      case "user_aborted":
        return { kind: "ai-router", message: "Cancelled." };
      case "quota":
        return {
          kind: "ai-router",
          message: "You've hit the free AI limit for now — try again in a moment.",
        };
      default:
        return {
          kind: "ai-router",
          message:
            "Couldn't reach a free AI provider. Check your connection or add a key in Settings.",
        };
    }
  }

  // SpeechError — a SpeechErrorCode `code` plus a `needsPermission` flag.
  // Its `message` is already written for a student, so prefer it verbatim.
  if (
    typeof error.code === "string" &&
    SPEECH_CODES.has(error.code) &&
    "needsPermission" in error
  ) {
    return {
      kind: "speech",
      message:
        typeof error.message === "string" && error.message.trim()
          ? error.message
          : "Voice input hit a snag — tap to try again.",
    };
  }

  // CardReviewConstraintError — tagged with `provider === 'cardReviews'`.
  if (error.provider === "cardReviews") {
    return {
      kind: "card-review",
      message:
        "Couldn't save that rating. Your progress is kept and it'll sync on the next review.",
    };
  }

  // RateLimitError — named + carries a numeric `retryAfter`.
  if (error.name === "RateLimitError" && typeof error.retryAfter === "number") {
    return {
      kind: "rate-limit",
      message: `You're going a little fast — try again in ${Math.max(1, Math.ceil(error.retryAfter))}s.`,
    };
  }

  // GroqUnavailableError — tagged `provider === 'groq'`.
  if (error.provider === "groq") {
    if (error.isAuthFailure) {
      return {
        kind: "groq",
        message: "Your Groq key was rejected. Check it in Settings → AI Provider.",
      };
    }
    if (error.isQuotaExhausted) {
      return {
        kind: "groq",
        message: "Groq quota reached — the free fallback will handle this.",
      };
    }
    return {
      kind: "groq",
      message: "Groq is unavailable right now — using the free fallback.",
    };
  }

  // PuterAuthError — name-tagged.
  if (error.name === "PuterAuthError") {
    return {
      kind: "puter-auth",
      message: "Sign in to Puter (free) to continue — or add your own key in Settings.",
    };
  }

  return null;
}

/** Resolve a thrown value to a user-facing message. Never throws. */
export function errorMessage(error: unknown, fallback: string): string {
  const classified = classifyError(error);
  if (classified) return classified.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

/** Show a typed error as an error toast, with a safe fallback message. */
export function toastError(error: unknown, fallback: string): void {
  toast.error(errorMessage(error, fallback));
}

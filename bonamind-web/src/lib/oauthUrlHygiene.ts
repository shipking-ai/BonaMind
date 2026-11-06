/**
 * OAuth tokens must never reach telemetry. PostHog $pageviews and Sentry
 * breadcrumbs snapshot the current location, and the auth flows travel in
 * the URL — so the moment the app boots, any access_token/refresh_token in
 * the address (query or fragment) is moved out of the URL before the
 * telemetry stack initializes. The auth callback needs the original bytes
 * (the URL *is* its transport — the `code` lives there), so a memory-only
 * copy is kept for it; tokens leave the address bar and never become
 * breadcrumbs, pageviews or crash-report payloads.
 */

let captured = '';

export function captureAndScrubOAuthUrl(): void {
  try {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const tokenish =
      url.searchParams.has('access_token') ||
      url.searchParams.has('refresh_token') ||
      /(^|&|[#?])(access_token|refresh_token|id_token)=/.test(url.hash) ||
      /(^|&|[#?])(access_token|refresh_token|id_token)=/.test(url.search);
    const recoveryish = /type=recovery/.test(url.hash + url.search) || url.searchParams.has('type');
    if (tokenish) captured = window.location.href;
    if (!tokenish && !recoveryish) return;
    // Scrub risky params from the address; keep benign navigation hints
    // (code, type, error) so the PKCE callback keeps working from the live URL.
    const clean = new URL(window.location.href);
    if (/access_token=|refresh_token=|id_token=/.test(clean.hash)) clean.hash = '';
    clean.searchParams.delete('access_token');
    clean.searchParams.delete('refresh_token');
    clean.searchParams.delete('id_token');
    window.history.replaceState(null, '', clean.toString());
  } catch {
    // Scrubbing may never break boot; telemetry uses whatever is left.
  }
}

/** The pre-scrub URL, kept only in memory for the auth callback. */
export function capturedOAuthUrl(): string {
  return captured;
}

/** Test isolation only: clears the in-memory copy between tests. */
export function resetCapturedOAuthUrlForTests(): void {
  captured = '';
}

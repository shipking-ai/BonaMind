import type { Page } from '@playwright/test';

/**
 * Navigate to an app route using `domcontentloaded` rather than `load`.
 *
 * The app keeps long-lived connections open (Supabase Realtime, Turnstile,
 * analytics, dev-server HMR). In sandboxed or offline networks one of those
 * can hold the `load` event open indefinitely, which turns every
 * `page.goto()` into a 30s timeout even though the UI is usable. Tests
 * should wait for the specific UI they assert on instead.
 */
export function gotoApp(page: Page, path = '/') {
  return page.goto(path, { waitUntil: 'domcontentloaded' });
}

import { isAppShell } from './platform';

/**
 * Recover a browser tab that is still running the build from before a deploy.
 *
 * Every deploy renames the build's files. A tab opened earlier (or served an
 * older index by the service worker) keeps asking for the old names. Most of
 * those are in the precache, but the big on-demand chunks are left out of it
 * on purpose (PDF engine, on-device AI; see `pwa.ts`), so the request reaches
 * the server, which no longer has the file. The import fails and the feature
 * stays broken until the user reloads by hand.
 *
 * On that failure this asks the service worker to update, lets a new one take
 * over, and reloads the page once. A short window stops it reloading in a
 * loop if the reload did not help; the error then reaches the error boundary
 * and is reported as usual.
 *
 * The installed apps ship every file in the package, so a missing chunk there
 * is a real bug, not a stale deploy, and is left alone.
 */

const STORAGE_KEY = 'bonamind:stale-deploy-reload-at';
/** A second failure within this long after a reload is not retried. */
const RETRY_WINDOW_MS = 60_000;
const DEFAULT_SW_TIMEOUT_MS = 4_000;

const STALE_CHUNK_MESSAGES = [
  'failed to fetch dynamically imported module', // Chromium
  'error loading dynamically imported module', // Firefox
  'importing a module script failed', // Safari
  'unable to preload css', // Vite's preload helper
];

type MinimalStorage = Pick<Storage, 'getItem' | 'setItem'>;
type MinimalServiceWorkerContainer = Pick<
  ServiceWorkerContainer,
  'getRegistration' | 'addEventListener' | 'removeEventListener'
>;

export interface StaleDeployOptions {
  reload?: () => void;
  storage?: MinimalStorage | null;
  now?: () => number;
  serviceWorker?: MinimalServiceWorkerContainer | null;
  swTimeoutMs?: number;
}

export function isStaleDeployError(reason: unknown): boolean {
  const message =
    reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
  if (!message) return false;
  const lower = message.toLowerCase();
  return STALE_CHUNK_MESSAGES.some((m) => lower.includes(m));
}

function defaultStorage(): MinimalStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function defaultServiceWorker(): MinimalServiceWorkerContainer | null {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    ? navigator.serviceWorker
    : null;
}

/** Ask for a new service worker and, if one is coming, wait for it to take control. */
async function refreshServiceWorker(sw: MinimalServiceWorkerContainer | null, timeoutMs: number) {
  if (!sw) return;
  const work = (async () => {
    const registration = await sw.getRegistration();
    if (!registration) return;
    await registration.update();
    if (!registration.installing && !registration.waiting) return;
    await new Promise<void>((resolve) => {
      sw.addEventListener('controllerchange', () => resolve(), { once: true });
    });
  })().catch(() => undefined);
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

/**
 * Start the reload if one hasn't just been tried. Returns true when it has
 * taken charge of the failure (the caller should stay quiet), false otherwise.
 */
export function tryRecoverFromStaleDeploy(options: StaleDeployOptions = {}): boolean {
  if (isAppShell()) return false;

  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = (options.now ?? Date.now)();
  try {
    const last = Number(storage?.getItem(STORAGE_KEY) ?? 0);
    if (last && now - last < RETRY_WINDOW_MS) return false;
    storage?.setItem(STORAGE_KEY, String(now));
  } catch {
    // Storage blocked: without it there is no loop guard, so don't reload.
    return false;
  }
  if (!storage) return false;

  const reload = options.reload ?? (() => window.location.reload());
  const sw = options.serviceWorker === undefined ? defaultServiceWorker() : options.serviceWorker;
  void refreshServiceWorker(sw, options.swTimeoutMs ?? DEFAULT_SW_TIMEOUT_MS).then(reload);
  return true;
}

/** Listen for missing-chunk failures. Returns a function that removes the listeners. */
export function installStaleDeployRecovery(options: StaleDeployOptions = {}): () => void {
  const onPreloadError = (event: Event) => {
    const reason = (event as Event & { payload?: unknown }).payload;
    // Without preventDefault Vite rethrows, so only claim it when reloading.
    if (isStaleDeployError(reason) && tryRecoverFromStaleDeploy(options)) event.preventDefault();
  };
  const onRejection = (event: Event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    if (isStaleDeployError(reason)) tryRecoverFromStaleDeploy(options);
  };
  window.addEventListener('vite:preloadError', onPreloadError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('vite:preloadError', onPreloadError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

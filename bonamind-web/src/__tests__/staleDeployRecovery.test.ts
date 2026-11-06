import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A tab opened before a deploy keeps asking for the previous build's file
 * names. The PDF engine (and a few other big chunks) is left out of the
 * service worker's precache on purpose, so those requests reach the server,
 * which no longer has the file. Before this fix the server answered with the
 * SPA's index.html, the browser refused it as a script ("Expected a
 * JavaScript-or-Wasm module script but the server responded with a MIME type
 * of text/html"), and the feature stayed broken until a manual hard reload.
 */

const shell = vi.hoisted(() => ({ app: false }));
vi.mock('../lib/platform', () => ({ isAppShell: () => shell.app }));

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

function preloadError(payload: unknown) {
  const event = new Event('vite:preloadError', { cancelable: true }) as Event & { payload?: unknown };
  event.payload = payload;
  return event;
}

const CHROME = new TypeError('Failed to fetch dynamically imported module: https://bonamind.app/assets/vendor-pdfjs-B_9OYGhe.js');

async function load() {
  return import('../lib/staleDeployRecovery');
}

describe('stale deploy recovery', () => {
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    shell.app = false;
    vi.resetModules();
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
  });

  it('recognises a missing-chunk error in each browser and nothing else', async () => {
    const { isStaleDeployError } = await load();
    expect(isStaleDeployError(CHROME)).toBe(true);
    expect(isStaleDeployError(new TypeError('error loading dynamically imported module: /assets/x-12345678.js'))).toBe(true);
    expect(isStaleDeployError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleDeployError(new Error('Unable to preload CSS for /assets/x-12345678.css'))).toBe(true);
    expect(isStaleDeployError(new Error('Network request failed'))).toBe(false);
    expect(isStaleDeployError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isStaleDeployError(undefined)).toBe(false);
  });

  it('reloads once when a lazy chunk from an older deploy is gone', async () => {
    const { installStaleDeployRecovery } = await load();
    const reload = vi.fn();
    uninstall = installStaleDeployRecovery({ reload, storage: memoryStorage(), swTimeoutMs: 10 });

    const event = preloadError(CHROME);
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('does not reload in a loop when the reload did not help', async () => {
    const { installStaleDeployRecovery } = await load();
    const reload = vi.fn();
    const storage = memoryStorage();
    let clock = 1_000_000;
    uninstall = installStaleDeployRecovery({ reload, storage, now: () => clock, swTimeoutMs: 10 });

    window.dispatchEvent(preloadError(CHROME));
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    // The page reloaded and the same chunk failed again a moment later.
    clock += 2_000;
    const again = preloadError(CHROME);
    window.dispatchEvent(again);
    await new Promise((r) => setTimeout(r, 30));

    expect(reload).toHaveBeenCalledTimes(1);
    // Left alone so the error reaches the error boundary and is reported.
    expect(again.defaultPrevented).toBe(false);

    // Much later (a new deploy, say) it may try again.
    clock += 10 * 60_000;
    window.dispatchEvent(preloadError(CHROME));
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
  });

  it('also catches a failed import() that skipped the preload helper', async () => {
    const { installStaleDeployRecovery } = await load();
    const reload = vi.fn();
    uninstall = installStaleDeployRecovery({ reload, storage: memoryStorage(), swTimeoutMs: 10 });

    const rejected = Promise.reject(CHROME);
    rejected.catch(() => undefined);
    const event = new Event('unhandledrejection', { cancelable: true }) as Event & { reason?: unknown };
    event.reason = CHROME;
    window.dispatchEvent(event);

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('ignores ordinary failures', async () => {
    const { installStaleDeployRecovery } = await load();
    const reload = vi.fn();
    uninstall = installStaleDeployRecovery({ reload, storage: memoryStorage(), swTimeoutMs: 10 });

    const event = preloadError(new Error('Network request failed'));
    window.dispatchEvent(event);
    await new Promise((r) => setTimeout(r, 30));

    expect(event.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('leaves the installed apps alone, which ship every file in the package', async () => {
    shell.app = true;
    const { tryRecoverFromStaleDeploy } = await load();
    const reload = vi.fn();
    expect(tryRecoverFromStaleDeploy({ reload, storage: memoryStorage(), swTimeoutMs: 10 })).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(reload).not.toHaveBeenCalled();
  });

  it('lets a waiting service worker take over first, so the reload gets the new build', async () => {
    const { tryRecoverFromStaleDeploy } = await load();
    const order: string[] = [];
    const listeners: Array<() => void> = [];
    const registration = {
      installing: null as object | null,
      waiting: null,
      update: vi.fn(async () => {
        order.push('update');
        registration.installing = {};
        setTimeout(() => {
          order.push('controllerchange');
          listeners.forEach((l) => l());
        }, 5);
      }),
    };
    const sw = {
      getRegistration: async () => registration,
      addEventListener: (_: string, l: () => void) => listeners.push(l),
      removeEventListener: () => undefined,
    };

    const reload = vi.fn(() => order.push('reload'));
    expect(
      tryRecoverFromStaleDeploy({ reload, storage: memoryStorage(), serviceWorker: sw as never, swTimeoutMs: 1_000 }),
    ).toBe(true);

    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    expect(order).toEqual(['update', 'controllerchange', 'reload']);
  });
});

describe('vercel.json', () => {
  const config = JSON.parse(readFileSync(resolve(__dirname, '../../../vercel.json'), 'utf8')) as {
    rewrites: Array<{ source: string; destination: string }>;
  };
  const spa = config.rewrites.find((r) => r.destination === '/index.html');
  const matches = (path: string) => new RegExp(`^${spa!.source}$`).test(path);

  it('sends app routes to the SPA', () => {
    expect(spa).toBeDefined();
    expect(matches('/')).toBe(true);
    expect(matches('/study/abc')).toBe(true);
    expect(matches('/subscribe')).toBe(true);
  });

  it('answers a missing build file with a 404, not the home page', () => {
    // Filesystem hits are served before rewrites, so only files that are gone
    // reach this rule. index.html served as JavaScript is the MIME error, and
    // the PDF engine's cache-first rule would keep that HTML for 30 days.
    expect(matches('/assets/vendor-pdfjs-B_9OYGhe.js')).toBe(false);
    expect(matches('/assets/index-OLD12345.css')).toBe(false);
  });
});

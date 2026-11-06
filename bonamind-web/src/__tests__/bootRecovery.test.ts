import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * public/boot-recovery.js covers the one failure the app's own recovery
 * (src/lib/staleDeployRecovery.ts) cannot: the page's main script is gone.
 * That script is where the app's recovery lives, so nothing runs and the page
 * stays blank. It happens when the page HTML comes from a build that is no
 * longer deployed, usually a service worker's cached copy. This runs from the
 * HTML before the main script, with no build hash in its name.
 */

const SCRIPT = readFileSync(resolve(__dirname, '../../public/boot-recovery.js'), 'utf8');
const INDEX_HTML = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

function makeWindow(opts: { shell?: 'capacitor' | 'tauri'; storageBlocked?: boolean } = {}) {
  const listeners: Array<{ type: string; fn: (e: unknown) => void; capture: boolean }> = [];
  const store = new Map<string, string>();
  const unregister = vi.fn(async () => true);
  const deleted: string[] = [];
  let clock = 1_000_000;
  const win: Record<string, unknown> = {
    addEventListener: (type: string, fn: (e: unknown) => void, capture?: boolean) =>
      listeners.push({ type, fn, capture: capture === true }),
    navigator: {
      serviceWorker: { getRegistrations: async () => [{ unregister }, { unregister }] },
    },
    caches: {
      keys: async () => ['workbox-precache-v2-https://bonamind.app/', 'pdf-engine', 'on-device-ai'],
      delete: async (k: string) => {
        deleted.push(k);
        return true;
      },
    },
    location: { origin: 'https://bonamind.app', reload: vi.fn() },
    Date: { now: () => clock },
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, Math.min(ms, 50)),
  };
  if (opts.storageBlocked) {
    Object.defineProperty(win, 'sessionStorage', {
      get() {
        throw new Error('SecurityError');
      },
    });
  } else {
    win.sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
  }
  if (opts.shell === 'capacitor') win.Capacitor = { getPlatform: () => 'android' };
  if (opts.shell === 'tauri') win.__TAURI_INTERNALS__ = {};

  new Function('window', SCRIPT)(win);

  const fail = (tagName: string, attrs: Record<string, string>) => {
    const event = { target: { tagName, ...attrs } };
    listeners.filter((l) => l.type === 'error').forEach((l) => l.fn(event));
  };
  return {
    win,
    listeners,
    unregister,
    deleted,
    reload: (win.location as { reload: ReturnType<typeof vi.fn> }).reload,
    fail,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const ENTRY = { src: 'https://bonamind.app/assets/index-CNpyDHKH.js', type: 'module' };

describe('boot recovery', () => {
  it('listens in the capture phase, where failed script loads are seen', () => {
    const { listeners } = makeWindow();
    expect(listeners.some((l) => l.type === 'error' && l.capture)).toBe(true);
  });

  it('drops the stale worker and its precache, then reloads once, when the main script is gone', async () => {
    const page = makeWindow();
    page.fail('SCRIPT', ENTRY);

    await vi.waitFor(() => expect(page.reload).toHaveBeenCalledTimes(1));
    expect(page.unregister).toHaveBeenCalledTimes(2);
    // Only the precache holds the stale page. The on-demand caches stay, so
    // nobody re-downloads the PDF engine or a 6 MB AI model for this.
    expect(page.deleted).toEqual(['workbox-precache-v2-https://bonamind.app/']);
  });

  it('also covers a missing stylesheet or preloaded chunk from the build', async () => {
    const page = makeWindow();
    page.fail('LINK', { href: 'https://bonamind.app/assets/index-tFJphbQy.css' });
    await vi.waitFor(() => expect(page.reload).toHaveBeenCalledTimes(1));
  });

  it('does not loop when the reload did not help', async () => {
    const page = makeWindow();
    page.fail('SCRIPT', ENTRY);
    await vi.waitFor(() => expect(page.reload).toHaveBeenCalledTimes(1));

    page.advance(5_000);
    page.fail('SCRIPT', ENTRY);
    await new Promise((r) => setTimeout(r, 80));
    expect(page.reload).toHaveBeenCalledTimes(1);

    page.advance(10 * 60_000);
    page.fail('SCRIPT', ENTRY);
    await vi.waitFor(() => expect(page.reload).toHaveBeenCalledTimes(2));
  });

  it('ignores failures that are not the build: images, outside scripts', async () => {
    const page = makeWindow();
    page.fail('IMG', { src: 'https://bonamind.app/assets/missing.png' });
    page.fail('SCRIPT', { src: 'https://us-assets.i.posthog.com/static/array.js' });
    page.fail('SCRIPT', { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js' });
    await new Promise((r) => setTimeout(r, 80));
    expect(page.reload).not.toHaveBeenCalled();
  });

  it('does not reload when storage is blocked, since there is no loop guard', async () => {
    const page = makeWindow({ storageBlocked: true });
    page.fail('SCRIPT', ENTRY);
    await new Promise((r) => setTimeout(r, 80));
    expect(page.reload).not.toHaveBeenCalled();
  });

  it('does nothing in the installed apps, which ship every file', () => {
    expect(makeWindow({ shell: 'capacitor' }).listeners).toHaveLength(0);
    expect(makeWindow({ shell: 'tauri' }).listeners).toHaveLength(0);
  });

  it('is loaded from the page as a classic script before the main script', () => {
    const boot = INDEX_HTML.indexOf('<script src="/boot-recovery.js"></script>');
    const entry = INDEX_HTML.indexOf('<script type="module"');
    expect(boot).toBeGreaterThan(-1);
    expect(boot).toBeLessThan(entry);
  });
});

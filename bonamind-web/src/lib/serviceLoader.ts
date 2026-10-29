/**
 * Centralized Lazy Service Loader
 *
 * Registers services with metadata and provides a uniform `load()` API
 * that returns a cached promise on first call. Subsequent calls return
 * the same promise — no duplicate initialization.
 *
 * Usage:
 *   import { registerService, loadService } from '@/lib/serviceLoader';
 *
 *   registerService('leaderboard', () => import('./leaderboardService'));
 *   registerService('notifications', () => import('./realtimeNotifications'));
 *
 *   // Later (e.g. on mount or route navigation):
 *   const leaderboard = await loadService('leaderboard');
 *   leaderboard.fetchBoard();
 */

export interface ServiceDefinition {
  name: string;
  loader: () => Promise<unknown>;
  description?: string;
  priority?: 'high' | 'normal' | 'low';
}

interface RegisteredService extends ServiceDefinition {
  promise: Promise<unknown> | null;
  loaded: boolean;
  error: Error | null;
  loadTimeMs: number | null;
}

// ─── Registry ─────────────────────────────────────────────────

const registry = new Map<string, RegisteredService>();

/**
 * Register a service for lazy loading. Overwrites any previous
 * registration with the same name.
 */
export function registerService(
  name: string,
  loader: () => Promise<unknown>,
  opts?: { description?: string; priority?: 'high' | 'normal' | 'low' },
): void {
  registry.set(name, {
    name,
    loader,
    description: opts?.description,
    priority: opts?.priority ?? 'normal',
    promise: null,
    loaded: false,
    error: null,
    loadTimeMs: null,
  });
}

/**
 * Load a registered service by name. Returns the cached module on
 * subsequent calls. The promise is created lazily — nothing loads
 * until `loadService()` is first called for that name.
 *
 * @throws If the service was never registered or the loader rejects.
 */
export async function loadService<T = unknown>(name: string): Promise<T> {
  const entry = registry.get(name);
  if (!entry) {
    throw new Error(`[ServiceLoader] Service "${name}" is not registered.`);
  }

  if (entry.loaded && entry.promise) {
    return entry.promise as Promise<T>;
  }

  if (!entry.promise) {
    const t0 = performance.now();
    entry.promise = entry
      .loader()
      .then((mod) => {
        entry.loaded = true;
        entry.loadTimeMs = performance.now() - t0;
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console -- loader diagnostics
          console.log(
            `[ServiceLoader] "${name}" loaded in ${entry.loadTimeMs.toFixed(0)}ms`,
          );
        }
        return mod;
      })
      .catch((err) => {
        entry.error = err instanceof Error ? err : new Error(String(err));
        entry.promise = null; // allow retry
        throw err;
      });
  }

  return entry.promise as Promise<T>;
}

/**
 * Preload one or more services in the background (fire-and-forget).
 * Useful during idle time or app shell mount.
 */
export function preloadServices(names: string[]): void {
  names.forEach((name) => {
    const entry = registry.get(name);
    if (entry && !entry.loaded) {
      // Trigger the lazy load without awaiting
      loadService(name).catch(() => {
        /* preload failures are non-fatal */
      });
    }
  });
}

/**
 * Get a snapshot of all registered services and their status.
 * Useful for admin diagnostics.
 */
export function getServiceStatus(): Array<{
  name: string;
  description?: string;
  priority?: string;
  loaded: boolean;
  error: string | null;
  loadTimeMs: number | null;
}> {
  return Array.from(registry.values()).map((s) => ({
    name: s.name,
    description: s.description,
    priority: s.priority,
    loaded: s.loaded,
    error: s.error?.message ?? null,
    loadTimeMs: s.loadTimeMs,
  }));
}

/**
 * Reset a service's cached promise so it re-loads on next `loadService()`.
 * Useful for error recovery or hot-reloading.
 */
export function resetService(name: string): void {
  const entry = registry.get(name);
  if (entry) {
    entry.promise = null;
    entry.loaded = false;
    entry.error = null;
    entry.loadTimeMs = null;
  }
}

/**
 * Unregister a service entirely.
 */
export function unregisterService(name: string): void {
  registry.delete(name);
}

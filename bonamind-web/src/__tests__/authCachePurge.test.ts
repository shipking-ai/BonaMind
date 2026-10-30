/**
 * Red-team regression for the logout cache (#216-adjacent class shared
 * browser): Supabase GET responses were cached for an hour in the workbox
 * runtime cache and survived sign-out, so the next person on a shared
 * browser could be served the previous user's rows offline.
 *
 * Sign-out now drops that cache centrally (one SIGNED_OUT listener on the
 * client — covers every sign-out path), and only that cache.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stubs = vi.hoisted(() => {
  const store = new Map<string, boolean>();
  return {
    store,
    cachesStub: {
      keys: async () => [...store.keys()],
      delete: async (_name: string) => {
        store.delete(_name);
        return true;
      },
      open: async () => ({ put: async () => undefined, match: async () => undefined }),
    } as unknown as CacheStorage,
  };
});

vi.stubGlobal('caches', stubs.cachesStub);

const { purgeSupabaseCache, SUPABASE_CACHE_NAME } = await import('../lib/authCachePurge');

beforeEach(() => {
  stubs.store.clear();
});

describe('purgeSupabaseCache', () => {
  it('deletes the supabase runtime cache and only that', async () => {
    stubs.store.set(SUPABASE_CACHE_NAME, true);
    stubs.store.set('workbox-precache-v2-http://localhost/', true);
    stubs.store.set('user-uploads', true);

    await purgeSupabaseCache();

    expect(stubs.store.has(SUPABASE_CACHE_NAME)).toBe(false);
    expect(stubs.store.has('workbox-precache-v2-http://localhost/')).toBe(true);
    expect(stubs.store.has('user-uploads')).toBe(true);
  });

  it('tolerates a missing Cache API and an already-empty cache', async () => {
    await expect(purgeSupabaseCache()).resolves.toBeUndefined();
    vi.unstubAllGlobals();
    await expect(purgeSupabaseCache()).resolves.toBeUndefined();
    vi.stubGlobal('caches', stubs.cachesStub);
  });
});

describe('the wiring', () => {
  const src = (rel: string) => readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

  it('the runtime cache name matches the purge constant', () => {
    expect(src('lib/pwa.ts')).toContain(`cacheName: '${SUPABASE_CACHE_NAME}'`);
    expect(src('lib/authCachePurge.ts')).toContain(`export const SUPABASE_CACHE_NAME = '${SUPABASE_CACHE_NAME}'`);
  });

  it('one central SIGNED_OUT listener drops the cache', () => {
    const client = src('services/database/supabase.ts');
    expect(client).toMatch(/onAuthStateChange\(.*=?>\s*\{[\s\S]{0,120}SIGNED_OUT/);
    // Exactly one listener: sign-out cache hygiene must not fan out per screen.
    expect(client.match(/onAuthStateChange/g)?.length).toBe(1);
    expect(client).toContain('purgeSupabaseCache()');
  });
});

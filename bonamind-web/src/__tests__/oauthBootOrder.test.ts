/**
 * The boot cleanup removes auth values from the address bar, so sign-in relies
 * on the real client reading the URL the moment it is created. This runs the
 * real library so a dependency upgrade that changes that timing fails here
 * instead of in production sign-in.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureAndScrubOAuthUrl,
  resetCapturedOAuthUrlForTests,
} from '../lib/oauthUrlHygiene';

const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
const accessToken = [
  encode({ alg: 'HS256', typ: 'JWT' }),
  encode({ sub: 'user-1', aud: 'authenticated', exp: 4102444800 }),
  'signature',
].join('.');

afterEach(() => {
  vi.unstubAllGlobals();
  resetCapturedOAuthUrlForTests();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('auth client and URL cleanup order', () => {
  it('builds the session when the URL is cleaned right after the client is created', async () => {
    window.history.replaceState(
      null,
      '',
      `/auth/callback#access_token=${accessToken}&refresh_token=r&expires_in=3600&token_type=bearer`,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: 'user-1',
              aud: 'authenticated',
              app_metadata: {},
              user_metadata: {},
              created_at: '2026-01-01T00:00:00Z',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );

    const client = createClient('https://example.supabase.co', 'anon', {
      auth: { storageKey: 'boot-order-test' },
    });
    captureAndScrubOAuthUrl();

    expect(window.location.hash).toBe('');
    const { data } = await client.auth.getSession();
    expect(data.session?.user.id).toBe('user-1');
  });

  it('creates the client before the cleanup runs at boot', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/index.tsx'), 'utf8');
    const clientImport = source.indexOf("import './services/database/supabase'");
    const cleanupCall = source.indexOf('captureAndScrubOAuthUrl();');
    expect(clientImport).toBeGreaterThan(-1);
    expect(clientImport).toBeLessThan(cleanupCall);
  });
});

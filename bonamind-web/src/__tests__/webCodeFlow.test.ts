/**
 * The website signs in with the code flow (PKCE), not tokens in the URL.
 *
 * With PKCE a link only carries a one-time code, and the code only works in
 * the browser holding the secret that started the flow; tokens in the address
 * are ignored. The trade-off, which the owner accepted, is that a reset or
 * confirmation link has to be opened in the browser that asked for it.
 *
 * These run the real library, so an option or upgrade that quietly switches
 * the flow back fails here.
 */

import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ native: false, desktop: false }));
vi.mock('../lib/platform', () => ({
  isNativeApp: () => platform.native,
  isDesktopApp: () => platform.desktop,
  isAppShell: () => platform.native || platform.desktop,
}));

import { authCallbackUrl, authClientOptions } from '../lib/authFlow';

const STORAGE_KEY = 'web-code-flow-test';
const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
const accessToken = [
  encode({ alg: 'HS256', typ: 'JWT' }),
  encode({ sub: 'someone-else', aud: 'authenticated', exp: 4102444800 }),
  'signature',
].join('.');

const user = {
  id: 'user-1',
  aud: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};

function client() {
  const options = authClientOptions();
  return createClient('https://example.supabase.co', 'anon', {
    ...options,
    auth: { ...options.auth, storageKey: STORAGE_KEY },
  });
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  platform.native = false;
  platform.desktop = false;
});

describe('auth flow per surface', () => {
  it('uses the code flow on the website and in the Windows app', () => {
    expect(authClientOptions().auth.flowType).toBe('pkce');
    platform.desktop = true;
    expect(authClientOptions().auth.flowType).toBe('pkce');
  });

  it('leaves the phone apps as they were (they sign in with a password, no links come back to them)', () => {
    platform.native = true;
    expect(authClientOptions().auth.flowType).toBe('implicit');
  });

  it('builds the callback address, marking a reset', () => {
    expect(authCallbackUrl()).toBe(`${window.location.origin}/auth/callback`);
    expect(authCallbackUrl('recovery')).toBe(`${window.location.origin}/auth/callback?type=recovery`);
  });
});

describe('website auth client (real library)', () => {
  it('does not sign anyone in from tokens in a link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ...user, id: 'someone-else' })));
    window.history.replaceState(
      null,
      '',
      `/auth/callback#access_token=${accessToken}&refresh_token=r&expires_in=3600&token_type=bearer`,
    );

    const { data } = await client().auth.getSession();

    expect(data.session).toBeNull();
  });

  it('signs in from a code this browser started', async () => {
    const fetchMock = vi.fn(async () =>
      json({ access_token: accessToken, refresh_token: 'r', expires_in: 3600, token_type: 'bearer', user }),
    );
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.setItem(`${STORAGE_KEY}-code-verifier`, JSON.stringify('the-verifier'));
    window.history.replaceState(null, '', '/auth/callback?code=one-time-code&type=recovery');

    const { data } = await client().auth.getSession();

    expect(data.session?.user.id).toBe('user-1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('grant_type=pkce');
    expect(JSON.parse(String(init.body))).toMatchObject({ auth_code: 'one-time-code', code_verifier: 'the-verifier' });
  });

  it('asks for a reset link bound to this browser', async () => {
    const fetchMock = vi.fn(async () => json({}));
    vi.stubGlobal('fetch', fetchMock);

    await client().auth.resetPasswordForEmail('a@example.com', { redirectTo: authCallbackUrl('recovery') });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/recover');
    expect(decodeURIComponent(url)).toContain(`redirect_to=${authCallbackUrl('recovery')}`);
    expect(JSON.parse(String(init.body)).code_challenge).toBeTruthy();
    expect(window.localStorage.getItem(`${STORAGE_KEY}-code-verifier`)).toBeTruthy();
  });
});

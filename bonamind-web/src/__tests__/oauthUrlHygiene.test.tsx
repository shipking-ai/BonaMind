/**
 * Auth URL handling:
 *
 * 1. The boot cleanup runs before telemetry initializes and keeps the `code`
 *    the code flow needs.
 * 2. The callback page exchanges only a real code, never builds a session
 *    from URL values itself, and routes a recovery link to the password
 *    screen on every path.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import CallbackPage from '../pages/auth/CallbackPage';
import {
  captureAndScrubOAuthUrl,
  capturedOAuthUrl,
  resetCapturedOAuthUrlForTests,
} from '../lib/oauthUrlHygiene';

const supabase = vi.hoisted(() => ({
  auth: {
    exchangeCodeForSession: vi.fn(),
    setSession: vi.fn(),
    getSession: vi.fn(),
  },
}));

vi.mock('../services/database/supabase', () => ({ supabase }));
vi.mock('../lib/onboardingGate', () => ({ hasCompletedOnboarding: () => true }));

function WhereAmI() {
  const location = useLocation();
  return <output data-testid="route">{location.pathname + location.search}</output>;
}

function CallbackPageHost() {
  return (
    <MemoryRouter initialEntries={['/auth/callback']}>
      <CallbackPage />
      <WhereAmI />
    </MemoryRouter>
  );
}

const route = () => screen.getByTestId('route').textContent;

afterEach(() => {
  vi.resetAllMocks();
  resetCapturedOAuthUrlForTests();
});

describe('captureAndScrubOAuthUrl (boot)', () => {
  it('keeps the code flow in a memory copy and wipes tokens from the address', () => {
    window.history.replaceState(
      null,
      '',
      'http://localhost:3000/auth/callback?code=abc123&access_token=SECRET&refresh_token=REFRESH',
    );

    captureAndScrubOAuthUrl();

    // The flow gets the full original (the URL IS its transport).
    expect(capturedOAuthUrl()).toContain('code=abc123');
    expect(capturedOAuthUrl()).toContain('access_token=SECRET');
    // The address keeps the working part and loses the secret parts.
    expect(window.location.search).toContain('code=abc123');
    expect(window.location.search).not.toContain('access_token');
    expect(window.location.search).not.toContain('refresh_token');
  });

  it('scrubs implicit-flow fragments entirely', () => {
    window.history.replaceState(
      null,
      '',
      'http://localhost:3000/auth/callback#access_token=IMPLICIT&refresh_token=REFRESH&type=recovery',
    );

    captureAndScrubOAuthUrl();

    expect(capturedOAuthUrl()).toContain('type=recovery');
    expect(window.location.hash).not.toContain('token');
  });

  it('runs before telemetry initializes (boot order pin)', () => {
    const boot = readFileSync(path.resolve(__dirname, '../index.tsx'), 'utf8');
    const scrubAt = boot.indexOf('captureAndScrubOAuthUrl()');
    const sentryAt = boot.indexOf('initSentry()');
    expect(scrubAt).toBeGreaterThan(-1);
    expect(sentryAt).toBeGreaterThan(-1);
    expect(scrubAt).toBeLessThan(sentryAt);
  });
});

describe('CallbackPage', () => {
  it('never calls setSession; the PKCE exchange builds the session', async () => {
    window.history.replaceState(null, '', 'http://localhost:3000/auth/callback?code=good');
    captureAndScrubOAuthUrl(); // what boot would already have done
    supabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { user_metadata: {} } } },
      error: null,
    });

    render(<CallbackPageHost />);

    await waitFor(() => expect(screen.getByText(/Signed in!/i)).toBeTruthy());
    // The exchange consumed the captured URL's code (the transport survives
    // the scrub), and NO session was built from URL tokens.
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('good');
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it('routes a recovery link to the password screen, via the same exchange', async () => {
    window.history.replaceState(
      null,
      '',
      'http://localhost:3000/auth/callback?code=reset-code&type=recovery',
    );
    captureAndScrubOAuthUrl();
    supabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { user_metadata: {} } } },
      error: null,
    });

    render(<CallbackPageHost />);

    await waitFor(() => expect(screen.getByText(/Signed in!/i)).toBeTruthy());
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(route()).toBe('/reset-password?mode=update'), { timeout: 2000 });
  });

  it('routes a fragment recovery link to the password screen without exchanging anything', async () => {
    window.history.replaceState(
      null,
      '',
      'http://localhost:3000/auth/callback#access_token=A&refresh_token=R&token_type=bearer&type=recovery',
    );
    captureAndScrubOAuthUrl();
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { user_metadata: {} } } },
      error: null,
    });

    render(<CallbackPageHost />);

    await waitFor(() => expect(route()).toBe('/reset-password?mode=update'), { timeout: 2000 });
    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it('keeps the recovery route when the client already consumed the code', async () => {
    window.history.replaceState(null, '', 'http://localhost:3000/auth/callback?code=used&type=recovery');
    captureAndScrubOAuthUrl();
    supabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'code already used' },
    });
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { user_metadata: {} } } },
      error: null,
    });

    render(<CallbackPageHost />);

    await waitFor(() => expect(route()).toBe('/reset-password?mode=update'), { timeout: 2000 });
  });

  // A code only works in the browser that started the flow. The library's own
  // message for this is written for developers (it suggests SSR packages).
  const verifierMissing = {
    name: 'AuthPKCECodeVerifierMissingError',
    code: 'pkce_code_verifier_not_found',
    message: 'PKCE code verifier not found in storage. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr',
  };

  it('tells a reset link opened in another browser what to do, in plain words', async () => {
    window.history.replaceState(null, '', 'http://localhost:3000/auth/callback?code=x&type=recovery');
    supabase.auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: verifierMissing });
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    render(<CallbackPageHost />);

    expect(await screen.findByText(/open the reset link in the browser where you asked for it/i)).toBeTruthy();
    expect(screen.queryByText(/SSR|verifier/i)).toBeNull();
  });

  it('tells a confirmation link opened in another browser that the email is confirmed', async () => {
    window.history.replaceState(null, '', 'http://localhost:3000/auth/callback?code=x');
    supabase.auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: verifierMissing });
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    render(<CallbackPageHost />);

    expect(await screen.findByText(/only works in the browser where you started/i)).toBeTruthy();
    expect(screen.getByText(/sign in/i)).toBeTruthy();
    expect(screen.queryByText(/SSR|verifier/i)).toBeNull();
  });

  it('reports a failure when no code and no session exist', async () => {
    window.history.replaceState(null, '', 'http://localhost:3000/auth/callback');
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    render(<CallbackPageHost />);

    expect(await screen.findByText('Sign-in failed')).toBeTruthy();
  });

  it('surfaces OAuth errors instead of exchanging them', async () => {
    window.history.replaceState(
      null,
      '',
      'http://localhost:3000/auth/callback?error=access_denied&error_description=Nope',
    );
    render(<CallbackPageHost />);

    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(await screen.findByText('Sign-in failed')).toBeTruthy();
  });
});


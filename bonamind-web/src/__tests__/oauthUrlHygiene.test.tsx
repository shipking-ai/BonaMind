/**
 * Red-team regression for URL-travelling OAuth tokens:
 *
 * 1. The boot scrub must run BEFORE telemetry initializes, and must wipe
 *    token params from the address while keeping the `code` the PKCE flow
 *    needs.
 * 2. The callback page must build the session from the code exchange â€”
 *    never `setSession` from tokens read out of the URL â€” and route a
 *    recovery link to the password screen.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

function CallbackPageHost() {
  return (
    <MemoryRouter initialEntries={['/auth/callback']}>
      <CallbackPage />
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
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
    expect(supabase.auth.exchangeCodeForSession.mock.calls[0]?.[0]).toContain('code=good');
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
      data: { session: { user: { user_metadata: {} } }, error: null },
    });

    render(<CallbackPageHost />);

    await waitFor(() => expect(screen.getByText(/Signed in!/i)).toBeTruthy());
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).not.toBe('/dashboard');
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


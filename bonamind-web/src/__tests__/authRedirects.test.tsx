import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Where an emailed auth link sends the user back to.
 *
 * With the code flow (PKCE) a link returns as `?code=…` and nothing else, so
 * the address the app asks for has to carry what the callback page needs:
 *
 * - A reset link asks for `/auth/callback?type=recovery`. Without the type,
 *   the callback can't tell a reset from a sign-in and opens the dashboard
 *   instead of "Set a new password".
 * - A sign-up confirmation asks for `/auth/callback`. It used to ask for
 *   nothing, so Supabase sent it to the Site URL (the home page), which never
 *   finishes a sign-in.
 */

const shell = vi.hoisted(() => ({ app: false }));
const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getSession: vi.fn(async () => ({ data: { session: null } })),
}));

vi.mock('../lib/platform', () => ({
  isAppShell: () => shell.app,
  isDesktopApp: () => false,
  isNativeApp: () => shell.app,
}));
vi.mock('../lib/nativeShim', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
}));
vi.mock('../services/database/supabase', () => ({ supabase: { auth } }));
vi.mock('../services/analytics/analyticsService', () => ({
  analyticsService: { track: vi.fn(), identify: vi.fn(), trackFunnel: vi.fn() },
}));
vi.mock('../components/auth/TurnstileWidget', () => ({
  default: () => null,
  isTurnstileEnabled: () => false,
}));

import AuthPage from '../components/auth/AuthPage';
import ResetPasswordPage from '../pages/auth/ResetPasswordPage';

const callback = () => `${window.location.origin}/auth/callback`;

beforeEach(() => {
  shell.app = false;
  vi.clearAllMocks();
});

describe('password reset link', () => {
  it('asks to come back to the callback marked as a reset', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@example.com' } });
    fireEvent.submit(screen.getByPlaceholderText('you@example.com').closest('form')!);

    await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1));
    expect(auth.resetPasswordForEmail.mock.calls[0][1].redirectTo).toBe(`${callback()}?type=recovery`);
  });
});

describe('sign-up confirmation link', () => {
  function signUp() {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { id: 'u' } }, error: null });
    render(
      <MemoryRouter initialEntries={['/auth?mode=signup']}>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Create a password'), { target: { value: 'secret-pass' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm your password'), { target: { value: 'secret-pass' } });
    fireEvent.submit(screen.getByPlaceholderText('you@example.com').closest('form')!);
  }

  it('asks to come back to the callback on the website', async () => {
    signUp();
    await waitFor(() => expect(auth.signUp).toHaveBeenCalledTimes(1));
    expect(auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe(callback());
  });

  it('leaves the installed apps on the project default (their own origin is not a website)', async () => {
    shell.app = true;
    signUp();
    await waitFor(() => expect(auth.signUp).toHaveBeenCalledTimes(1));
    expect(auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBeUndefined();
  });
});

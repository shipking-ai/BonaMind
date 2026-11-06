import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The sign-in form had no way to reset a password. /reset-password existed,
 * but the only link to it was in Settings, which needs you signed in, so
 * anyone who forgot their password was stuck.
 */

const shell = vi.hoisted(() => ({ app: false }));

vi.mock('../lib/platform', () => ({
  isAppShell: () => shell.app,
  isDesktopApp: () => false,
}));
vi.mock('../lib/nativeShim', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
}));
vi.mock('../services/database/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signInWithOAuth: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
}));
vi.mock('../services/analytics/analyticsService', () => ({
  analyticsService: { track: vi.fn(), identify: vi.fn() },
}));
vi.mock('../components/auth/TurnstileWidget', () => ({
  default: () => null,
  isTurnstileEnabled: () => false,
}));

import AuthPage from '../components/auth/AuthPage';

function renderAuth(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/reset-password" element={<p>reset page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Forgot password link', () => {
  beforeEach(() => {
    shell.app = false;
  });

  it('is on the sign-in form and opens the reset page', () => {
    renderAuth('/auth?mode=login');
    fireEvent.click(screen.getByRole('link', { name: 'Forgot password?' }));
    expect(screen.getByText('reset page')).toBeTruthy();
  });

  it('is not on the sign-up form, where there is no password to forget', () => {
    renderAuth('/auth?mode=signup');
    expect(screen.queryByRole('link', { name: 'Forgot password?' })).toBeNull();
  });

  it('opens the website in the installed apps, where the reset email cannot link back in', () => {
    shell.app = true;
    renderAuth('/auth?mode=login');
    const link = screen.getByRole('link', { name: 'Forgot password?' });
    expect(link.getAttribute('href')).toBe('https://bonamind.app/reset-password');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});

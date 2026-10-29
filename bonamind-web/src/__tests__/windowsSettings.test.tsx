/**
 * The Windows app's Settings: account, Light/Dark/System, the existing
 * Windows settings, daily goal, links to the full settings page and (for
 * admins) the admin pages, and Sign out.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';

const bridge = vi.hoisted(() => ({
  applyTheme: vi.fn(async () => undefined),
  setShortcut: vi.fn(async () => ({ ok: true })),
  getAutostart: vi.fn(async () => false),
  setAutostart: vi.fn(async (on: boolean) => on),
  notificationsEnabled: vi.fn(async () => true),
  shortcutRegistered: vi.fn(async () => true),
}));
vi.mock('../desktop/bridge', () => ({ desktop: bridge }));
const updater = vi.hoisted(() => ({
  checkForDesktopUpdate: vi.fn(async () => null as null | { version: string; body?: string }),
  installDesktopUpdate: vi.fn(async () => undefined),
  desktopAppVersion: vi.fn(async () => '2.3.5' as string | null),
}));
vi.mock('../lib/desktopUpdater', () => updater);
vi.mock('../services/database/modules/sessionService', () => ({
  sessionService: { fetchStudySessions: vi.fn(async () => []) },
}));

import { ThemeProvider } from '../hooks/useTheme';
import { WindowsSettings } from '../components/windows/WindowsSettings';
import { renderWithWorkspace, testUser } from './helpers/windowsWorkspace';
import { UserRole, type UserProfile } from '../types';
import { resolvePlan } from '../lib/subscriptionPlan';

type W = Window & { __TAURI_INTERNALS__?: unknown };
beforeEach(() => { (window as W).__TAURI_INTERNALS__ = {}; localStorage.clear(); });
afterEach(() => { delete (window as W).__TAURI_INTERNALS__; localStorage.clear(); });

const mount = (user: UserProfile = testUser, onLogout = vi.fn()) => {
  renderWithWorkspace(<ThemeProvider><WindowsSettings /></ThemeProvider>, { path: '/dashboard/settings', fixture: { user, onLogout } });
  return onLogout;
};

describe('WindowsSettings', () => {
  it('shows the account', () => {
    mount();
    expect(screen.getByText('Matt Smith')).toBeVisible();
    expect(screen.getByText('matt@example.com')).toBeVisible();
  });

  it('shows the plan billing records, not one set in user_metadata', () => {
    // The workspace user is built by App.tsx with resolvePlan(authUser).
    const authUser = { app_metadata: {}, user_metadata: { plan: 'Pro' } };
    mount({ ...testUser, plan: resolvePlan(authUser) });
    expect(screen.getByText('Plan').nextElementSibling).toHaveTextContent('Starter');
  });

  it('shows Pro for a subscription app_metadata records', () => {
    mount({ ...testUser, plan: resolvePlan({ app_metadata: { subscription_status: 'active' } }) });
    expect(screen.getByText('Plan').nextElementSibling).toHaveTextContent('Pro');
  });

  it('switches between Light, Dark and System', () => {
    mount();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(localStorage.getItem('bonamind_theme')).toBe('"light"');
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
  });

  it('includes the Windows settings', () => {
    mount();
    expect(screen.getByText('Start with Windows')).toBeInTheDocument();
  });

  it('saves the daily goal', () => {
    mount();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Daily goal' }), { target: { value: '30' } });
    expect(localStorage.getItem('bonamind_dailyGoal')).toBe('"30"');
  });

  it('links to reminders and the full settings page', () => {
    mount();
    expect(screen.getByRole('link', { name: 'More settings' })).toHaveAttribute('href', '/dashboard/settings/all');
    expect(screen.getByRole('link', { name: 'Reminders' })).toHaveAttribute('href', '/dashboard/settings/all');
  });

  it('shows Admin only to admins', () => {
    mount();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  });

  it('shows Admin to an admin', () => {
    mount({ ...testUser, role: UserRole.ADMIN } as UserProfile);
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });

  it('signs out', () => {
    const onLogout = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onLogout).toHaveBeenCalled();
  });

  it('shows the version and checks for updates', async () => {
    // About → Check for updates had no way in from the Windows app.
    mount();
    expect(await screen.findByText('Version 2.3.5')).toBeVisible();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check for updates' })); });
    expect(updater.checkForDesktopUpdate).toHaveBeenCalled();
    expect(screen.getByText("You're on the latest version.")).toBeVisible();
  });

  it('offers to install a newer version', async () => {
    updater.checkForDesktopUpdate.mockResolvedValueOnce({ version: '2.4.0' });
    mount();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check for updates' })); });
    expect(screen.getByText('Version 2.4.0 is available.')).toBeVisible();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Restart and update' })); });
    expect(updater.installDesktopUpdate).toHaveBeenCalled();
  });

  it('says so when the update server cannot be reached', async () => {
    updater.checkForDesktopUpdate.mockRejectedValueOnce(new Error('offline'));
    mount();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check for updates' })); });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't reach the update server.");
  });
});

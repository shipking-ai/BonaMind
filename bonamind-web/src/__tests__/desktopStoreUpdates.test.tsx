/**
 * The Microsoft Store updates the Store build and forbids apps that update
 * themselves, so the Store build never checks GitHub for an installer and
 * says where its updates come from instead.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const invoke = vi.hoisted(() => vi.fn());
const check = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: () => check() }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '2.3.7' }));

import { checkForDesktopUpdate, desktopUpdatesFromStore } from '../lib/desktopUpdater';
import { WindowsUpdates } from '../components/windows/WindowsUpdates';

type W = Window & { __TAURI_INTERNALS__?: unknown };

function installedFrom(source: 'store' | 'installer') {
  invoke.mockImplementation(async (cmd: string) => (cmd === 'install_source' ? source : undefined));
}

beforeEach(() => {
  (window as W).__TAURI_INTERNALS__ = {};
  invoke.mockReset();
  check.mockReset().mockResolvedValue(null);
});
afterEach(() => { delete (window as W).__TAURI_INTERNALS__; });

describe('updates in the Store build', () => {
  it('never runs the self-updater', async () => {
    installedFrom('store');
    await expect(desktopUpdatesFromStore()).resolves.toBe(true);
    await expect(checkForDesktopUpdate()).resolves.toBeNull();
    expect(check).not.toHaveBeenCalled();
  });

  it('still checks GitHub in the installer build', async () => {
    installedFrom('installer');
    await expect(desktopUpdatesFromStore()).resolves.toBe(false);
    await checkForDesktopUpdate();
    expect(check).toHaveBeenCalled();
  });

  it('says the Store keeps it up to date instead of offering a check', async () => {
    installedFrom('store');
    render(<WindowsUpdates />);
    expect(await screen.findByText(/Microsoft Store keeps BonaMind up to date/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /check for updates/i })).toBeNull();
  });

  it('keeps the check button in the installer build', async () => {
    installedFrom('installer');
    render(<WindowsUpdates />);
    expect(await screen.findByRole('button', { name: /check for updates/i })).toBeInTheDocument();
  });
});

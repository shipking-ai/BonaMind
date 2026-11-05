/**
 * The Android app sells nothing (#226, option B). Google Play's Payments policy
 * usually requires Play Billing for digital subscriptions bought inside an app,
 * and the Play build used to send everyone without a subscription straight to
 * Stripe Checkout. On Android, /subscribe is now a plain screen with no link,
 * price or offer. The web, Windows and iOS builds are unchanged.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { isAndroidApp } = vi.hoisted(() => ({ isAndroidApp: vi.fn(() => true) }));

vi.mock('../lib/platform', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/platform')>()),
  isAndroidApp,
}));

import SubscribeScreen from '../components/auth/SubscribeScreen';

const user = { id: 'u1', email: 'sam@example.com', name: 'Sam' };

const renderScreen = (props: Partial<React.ComponentProps<typeof SubscribeScreen>> = {}) =>
  render(
    <MemoryRouter>
      <SubscribeScreen user={user} onCheckAgain={vi.fn()} onSignOut={vi.fn()} {...props} />
    </MemoryRouter>,
  );

beforeEach(() => isAndroidApp.mockReturnValue(true));
afterEach(cleanup);

describe('/subscribe on Android', () => {
  it('offers no way to pay', () => {
    const { container } = renderScreen();
    expect(screen.queryByRole('button', { name: /trial/i })).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\$\d|trial|upgrade|stripe|save \d|https?:|bonamind\.app/i);
  });

  it('says where subscribing happens and which account is signed in', () => {
    renderScreen();
    expect(screen.getByText(/subscribe on the BonaMind website/i)).toBeTruthy();
    expect(screen.getByText('sam@example.com')).toBeTruthy();
  });

  it('lets someone who just subscribed check again, or sign out', () => {
    const onCheckAgain = vi.fn();
    const onSignOut = vi.fn();
    renderScreen({ onCheckAgain, onSignOut });
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onCheckAgain).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});

describe('/subscribe everywhere else', () => {
  it('still shows the plans and checkout', () => {
    isAndroidApp.mockReturnValue(false);
    renderScreen();
    expect(screen.getByRole('button', { name: /Start 7-Day Free Trial/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
  });
});

describe('the other ways into billing on Android', () => {
  const SRC = path.resolve(__dirname, '..');

  it('the app routes /subscribe through the Android-aware screen', () => {
    const app = readFileSync(path.join(SRC, 'App.tsx'), 'utf8');
    expect(app).toContain('<SubscribeScreen');
    expect(app).not.toContain('<PaymentPage');
  });

  it('the full settings page hides Manage subscription on Android', () => {
    const settings = readFileSync(path.join(SRC, 'pages/settings/SettingsPage.tsx'), 'utf8');
    expect(settings).toMatch(/!isAndroidApp\(\) && \(\s*<button onClick=\{handleManageSubscription\}/);
  });
});

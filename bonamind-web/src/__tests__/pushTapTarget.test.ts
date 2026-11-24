import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown) => void;
const shim = vi.hoisted(() => ({
  native: false,
  handlers: new Map<string, Handler>(),
}));

vi.mock('../lib/nativeShim', () => ({
  Capacitor: { isNativePlatform: () => shim.native },
  LocalNotifications: { schedule: () => Promise.resolve() },
  PushNotifications: {
    addListener: (event: string, handler: Handler) => {
      shim.handlers.set(event, handler);
      return Promise.resolve({ remove: () => undefined });
    },
  },
}));
vi.mock('../services/database/supabase', () => ({ supabase: null }));

import { initPushListeners, pushTapTarget } from '../services/notifications/pushService';

describe('pushTapTarget', () => {
  // Installed builds from the rename's first release on must follow links in
  // both schemes: the server switches its reminders to bonamind:// later.
  it('turns app links in both schemes into in-app routes', () => {
    expect(pushTapTarget({ link: 'bonamind://app/dashboard' })).toBe('/dashboard');
    expect(pushTapTarget({ link: 'auramind://app/decks' })).toBe('/dashboard/decks'); // legacy-name: ok
  });

  it('ignores anything that is not an allowed app link', () => {
    expect(pushTapTarget({ link: 'https://evil.example' })).toBeNull();
    expect(pushTapTarget({ link: 'bonamind://app/admin' })).toBeNull();
    expect(pushTapTarget({ link: 'bonamindx://app/dashboard' })).toBeNull();
    expect(pushTapTarget({})).toBeNull();
    expect(pushTapTarget(undefined)).toBeNull();
  });
});

describe('initPushListeners tap routing', () => {
  beforeEach(() => {
    shim.native = true;
    shim.handlers.clear();
  });

  // Setting window.location.href to a bonamind:// URL hands the link to
  // Android as a fresh VIEW intent: the system shows an "Open with" chooser
  // whenever a second installed app (the debug build, say) handles the
  // scheme. The tap must stay inside the app's own router.
  it('opens the link in the app router, not through the system', async () => {
    const openRoute = vi.fn();
    const before = window.location.href;
    initPushListeners(null, openRoute);
    await Promise.resolve();

    shim.handlers.get('pushNotificationActionPerformed')?.({
      notification: { data: { link: 'bonamind://app/dashboard' } },
    });

    expect(openRoute).toHaveBeenCalledWith('/dashboard');
    expect(window.location.href).toBe(before);
  });

  it('does nothing for a tap without an allowed link', async () => {
    const openRoute = vi.fn();
    initPushListeners(null, openRoute);
    await Promise.resolve();

    shim.handlers.get('pushNotificationActionPerformed')?.({
      notification: { data: { link: 'https://evil.example' } },
    });
    shim.handlers.get('pushNotificationActionPerformed')?.({ notification: {} });

    expect(openRoute).not.toHaveBeenCalled();
  });
});

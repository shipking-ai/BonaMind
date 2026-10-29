import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The full settings page and the Android settings load the profile through
 * userService.getCurrentUser. Its `plan` used to be the user_profiles row,
 * which nothing in the billing path updates, so a paying account could read
 * "Free" there while the other settings screens read "Pro". The plan now comes
 * from app_metadata via resolvePlan, the same as App.tsx's profile.
 */

const db = vi.hoisted(() => ({
  authUser: null as Record<string, unknown> | null,
  row: null as Record<string, unknown> | null,
}));

vi.mock('../services/database/supabase', () => {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: db.row, error: null }),
  };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: db.authUser }, error: null }) },
      from: () => query,
    },
  };
});

import { userService } from '../services/user/userService';

const row = (plan: string) => ({
  id: 'u-1',
  email: 'owner@example.com',
  name: 'Owner',
  plan,
  streak: 0,
  joined_date: '2026-01-01T00:00:00Z',
  role: 'owner',
});

beforeEach(() => {
  db.authUser = null;
  db.row = null;
});

describe('userService.getCurrentUser plan', () => {
  it('ignores the user_profiles row and user_metadata when nothing is billed', async () => {
    db.authUser = { id: 'u-1', app_metadata: {}, user_metadata: { plan: 'Pro' } };
    db.row = row('Pro');
    expect((await userService.getCurrentUser())?.plan).toBe('Starter');
  });

  it('shows Pro for a subscription app_metadata records, even if the row says Free', async () => {
    db.authUser = { id: 'u-1', app_metadata: { subscription_status: 'active' }, user_metadata: {} };
    db.row = row('Free');
    expect((await userService.getCurrentUser())?.plan).toBe('Pro');
  });
});

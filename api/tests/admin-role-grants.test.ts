import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

/**
 * Red-team regression: a staff account could mint any role — owner and ceo
 * included — for anyone, themselves included, because the grant endpoint
 * accepted a free role enum and only protected the operator account itself.
 *
 * Grants now follow a rank matrix (a role can only manage roles strictly
 * below its own; only the operator account outranks the table), so the
 * class of escalation is closed for good.
 */

const ADMIN_EMAIL = 'root@bonamind.app';

process.env.ADMIN_EMAIL = ADMIN_EMAIL;

const supabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
    admin: { getUserById: vi.fn(), updateUserById: vi.fn() },
  },
  from: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabase),
}));

const { call } = await import('./helpers.js');

/** UUIDs: the request schema validates the id shape. */
const uuid = (n: number) => `a1b2c3d4-e5f6-4a7b-8c9d-${String(n).padStart(12, '0')}`;

const actor = (rank: string) => ({
  id: uuid(1000),
  email: `${rank}.staff@bonamind.app`,
  app_metadata: { role: rank },
  user_metadata: {},
});

const target = (n: number, rank: string, email?: string) => ({
  id: uuid(n),
  email: email ?? `t${n}@example.com`,
  app_metadata: rank ? { role: rank } : {},
  user_metadata: {},
});

beforeEach(() => {
  supabase.from.mockReturnValue({ insert: async () => ({ error: null }) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function setRoleAs(actorUser: object, targetUser: object, role: string) {
  supabase.auth.getUser.mockResolvedValue({ data: { user: actorUser }, error: null });
  supabase.auth.admin.getUserById.mockResolvedValue({ data: { user: targetUser } });
  supabase.auth.admin.updateUserById.mockResolvedValue({ data: {} });
  return call('admin/utility', {
    headers: { authorization: 'Bearer token' },
    body: {
      action: 'set_role',
      targetUserId: (targetUser as { id: string }).id,
      testData: { role },
    },
  });
}

async function toggleAs(actorUser: object, targetUser: object, makeAdmin: boolean) {
  supabase.auth.getUser.mockResolvedValue({ data: { user: actorUser }, error: null });
  supabase.auth.admin.getUserById.mockResolvedValue({ data: { user: targetUser } });
  supabase.auth.admin.updateUserById.mockResolvedValue({ data: {} });
  return call('admin/toggle', {
    headers: { authorization: 'Bearer token' },
    body: { targetUserId: (targetUser as { id: string }).id, makeAdmin },
  });
}

describe('the staff role-grant matrix', () => {
  it('an admin can still manage accounts strictly below admin', async () => {
    const { status } = await setRoleAs(actor('admin'), target(1, 'user'), 'employee');
    expect(status).toBe(200);
  });

  it('an admin cannot mint an admin (the escalation)', async () => {
    const { status } = await setRoleAs(actor('admin'), target(2, 'user'), 'admin');
    expect(status).toBe(403);
    expect(supabase.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('an admin cannot mint owner or ceo, nor touch an admin account', async () => {
    for (const role of ['owner', 'ceo']) {
      const { status } = await setRoleAs(actor('admin'), target(3, 'user'), role);
      expect(status).toBe(403);
    }
    const { status } = await setRoleAs(actor('admin'), target(4, 'admin'), 'user');
    expect(status).toBe(403);
  });

  it('an admin cannot change the operator account itself', async () => {
    const { status } = await setRoleAs(actor('admin'), target(5, 'owner', ADMIN_EMAIL), 'user');
    expect(status).toBe(403);
  });

  it('a ceo can manage admins but cannot mint ceo or owner, nor touch the owner', async () => {
    const { status: ok } = await setRoleAs(actor('ceo'), target(6, 'admin'), 'user');
    expect(ok).toBe(200);

    const { status: mintCeo } = await setRoleAs(actor('ceo'), target(7, 'user'), 'ceo');
    expect(mintCeo).toBe(403);
    const { status: mintOwner } = await setRoleAs(actor('ceo'), target(8, 'user'), 'owner');
    expect(mintOwner).toBe(403);
    const { status: onOwner } = await setRoleAs(
      actor('ceo'),
      target(9, 'owner', 'owner@bonamind.app'),
      'user',
    );
    expect(onOwner).toBe(403);
  });

  it('the owner role can mint and demote ceo but cannot mint another owner', async () => {
    const { status: demote } = await setRoleAs(actor('owner'), target(10, 'ceo'), 'user');
    expect(demote).toBe(200);
    const { status: mintCeo } = await setRoleAs(actor('owner'), target(11, 'user'), 'ceo');
    expect(mintCeo).toBe(200);
    const { status: mintOwner } = await setRoleAs(actor('owner'), target(12, 'user'), 'owner');
    expect(mintOwner).toBe(403);
  });

  it('the operator account alone can mint an owner', async () => {
    const root = { id: uuid(9999), email: ADMIN_EMAIL, app_metadata: { role: 'user' }, user_metadata: {} };
    const { status } = await setRoleAs(root, target(13, 'user'), 'owner');
    expect(status).toBe(200);
  });

  it('the operator account keeps its self-rewrite protection', async () => {
    const root = { id: uuid(9999), email: ADMIN_EMAIL, app_metadata: { role: 'owner' }, user_metadata: {} };
    const { status } = await setRoleAs(root, target(14, 'owner', ADMIN_EMAIL), 'user');
    expect(status).toBe(403);
  });

  it('the admin toggle cannot mint admins from a plain admin either', async () => {
    const { status } = await toggleAs(actor('admin'), target(15, 'user'), true);
    expect(status).toBe(403);

    const { status: okFromCeo } = await toggleAs(actor('ceo'), target(16, 'user'), true);
    expect(okFromCeo).toBe(200);
  });
});

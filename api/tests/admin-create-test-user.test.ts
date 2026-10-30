import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

/**
 * Red-team regression: the test-user creation path treated "email already
 * registered" as a rerun artifact — it listed accounts, found whoever owned
 * the address, and DELETED them before recreating. A real person signing up
 * with a common name could vanish because a scan later reused their email.
 *
 * The endpoint now refuses existing emails outright and nothing in the flow
 * can call deleteUser at all.
 */

const supabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
    admin: {
      getUserById: vi.fn(),
      createUser: vi.fn(),
      deleteUser: vi.fn(),
      listUsers: vi.fn(),
      updateUserById: vi.fn(),
    },
  },
  from: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabase),
}));

const { call } = await import('./helpers.js');

const adminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin.staff@bonamind.app',
  app_metadata: { role: 'admin' },
  user_metadata: {},
};

beforeEach(() => {
  supabase.from.mockReturnValue({ insert: async () => ({ error: null }) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function request(email: string) {
  supabase.auth.getUser.mockResolvedValue({ data: { user: adminUser }, error: null });
  return call('admin/utility', {
    headers: { authorization: 'Bearer token' },
    body: {
      action: 'create_test_user',
      testData: { email, password: 'test-password-1' },
    },
  });
}

describe('the test-user creation path', () => {
  it('creates a genuinely fresh email', async () => {
    supabase.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: '22222222-2222-4222-8222-222222222222', email: 'scan-a@example.com' } },
      error: null,
    });
    const { status } = await request('scan-a@example.com');
    expect(status).toBe(200);
    expect(supabase.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('refuses an existing email and never deletes the account behind it', async () => {
    // supabase-js resolves HTTP errors as { data, error } — it does not reject.
    supabase.auth.admin.createUser
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'User already registered', status: 422 },
      })
      .mockResolvedValue({ data: { user: { id: 'recreated' } }, error: null });
    supabase.auth.admin.listUsers.mockResolvedValue({
      data: { users: [{ id: 'REAL-USER', email: 'taken@example.com' }] },
    });
    supabase.auth.admin.deleteUser.mockResolvedValue({ data: {} });

    const { status, body } = await request('taken@example.com');

    expect(status).toBe(409);
    expect(body.error).toMatch(/already exists/i);
    // The whole point: the holder of the email survives every code path.
    expect(supabase.auth.admin.deleteUser).not.toHaveBeenCalled();
    // A second create attempt (the old replace flow) must not happen either.
    expect(supabase.auth.admin.createUser).toHaveBeenCalledTimes(1);
  });
});

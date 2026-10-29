import { requireSupabase } from './supabase';

let hasSyncedForSession = false;

/**
 * Sync the current authenticated user to the `user_profiles` table.
 *
 * Originally wrote to a `users` mirror table duplicating `auth.users`. Now
 * a single idempotent UPSERT against the live `user_profiles` schema:
 *
 *   1. AUTH CHECK — returns `false` (intentional fail-closed) on no session
 *                   so ensureUserSynced throws and dependent RLS-gated reads
 *                   do not silently return zero rows for an unauthenticated
 *                   user. Failure surfaces correctly as "please sign in".
 *   2. UPSERT     — `upsert({ id, user_id }, { onConflict: 'user_id',
 *                   ignoreDuplicates: true })` sends BOTH `id` (PK) and
 *                   `user_id` (FK) explicitly so the row is the 1:1 mirror
 *                   of auth.users.id — robust against either a UUID id
 *                   (id = user.id) or a default-managed id (the migration
 *                   `20260718_cards_lapses_and_user_profiles_defaults.sql`
 *                   sets DEFAULT gen_random_uuid() as backup).
 *   3. ON CONFLICT — `ignoreDuplicates: true` translates to Postgres's
 *                   `INSERT … ON CONFLICT (user_id) DO NOTHING`. PostgREST
 *                   responds 200 (no data) instead of 409, which keeps
 *                   Sentry's HTTP-layer capture from raising a false-positive
 *                   alert for the expected race where two tabs/pages insert
 *                   at the same instant. No client-side 23505 special-casing
 *                   needed; the server handles it.
 *   4. SWALLOW     — any other upsert error is warn-and-continue. Dependent
 *                   RLS-gated reads still work via auth.uid() independently
 *                   of whether user_profiles has a row for this user. We do
 *                   NOT lock hasSyncedForSession here, so the next mount
 *                   retries the upsert. User flow is never broken.
 */
export async function syncCurrentUser(): Promise<boolean> {
  if (hasSyncedForSession) return true;

  try {
    const { data: { user }, error: authError } = await requireSupabase().auth.getUser();

    if (authError || !user) {
      console.error('No authenticated user found:', authError);
      return false;
    }

    // Single idempotent upsert. ON CONFLICT (user_id) DO NOTHING keeps
    // Postgres from firing 23505 unique_violation when the row already
    // exists, so this is 100% safe to call from any number of concurrent
    // tabs / mounts / refresh intervals without throwing.
    const { error: upsertError } = await requireSupabase()
      .from('user_profiles')
      .upsert(
        { id: user.id, user_id: user.id },
        { onConflict: 'user_id', ignoreDuplicates: true },
      );

    // Success path: lock the cached flag so subsequent calls short-circuit
    // at the top of syncCurrentUser.
    if (!upsertError) {
      hasSyncedForSession = true;
      return true;
    }

    // Any actual failure (network, RLS denial, downtime). Warn loud; don't
    // lock the cached flag — the next ensureUserSynced call will silently
    // retry the upsert. This is the M6.5.b round-5 silent-retry contract.
    console.warn(
      'syncUser upsert failed (returning true; will retry on next mount):',
      upsertError,
    );
    return true;
  } catch (error) {
    // M6.5.b round 5: catch-all is warn-and-return-true-without-lock. The
    // dependent RLS-gated reads still work via auth.uid() independently of
    // user_profiles state, and not locking the flag here means the next
    // syncCurrentUser call retries the upsert.
    console.error('Error syncing user (returning true; will retry on next mount):', error);
    return true;
  }
}

/**
 * Ensure user is synced before database operations. The previous version
 * threw on session-expiry mid-sync and left hasSyncedForSession truthy —
 * the next call would silently skip the re-sync and the user would see
 * RLS denials because their token had expired. We reset the flag on every
 * expiry-checked path so a refresh re-syncs.
 */
export async function ensureUserSynced(): Promise<void> {
  if (hasSyncedForSession) {
    const { data: { session } } = await requireSupabase().auth.getSession();
    if (!session) {
      hasSyncedForSession = false;
      throw new Error('Session expired. Please sign in again.');
    }
    return;
  }
  const synced = await syncCurrentUser();
  if (!synced) {
    throw new Error('Failed to sync user. Please sign in to save data.');
  }
}

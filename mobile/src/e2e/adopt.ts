import { router } from 'expo-router';
import { getSupabase } from '../data/supabase';

/**
 * Adopt a minted e2e session (the runtime token) and go to Today. The token
 * is a single-use refresh token: once adopted it is rotated, so keep the
 * attempts and never retry one — a bounce back to the welcome screen would
 * otherwise loop on a dead token.
 */
const adopted = new Set<string>();

export async function adoptRuntimeSession(rt: string) {
  if (adopted.has(rt)) return;
  adopted.add(rt);
  await getSupabase().auth.refreshSession({ refresh_token: rt });
  router.replace('/today');
}

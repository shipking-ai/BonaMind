import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { env } from '../env';
import { chunkedSecureStorage } from './secureStorage';

let client: SupabaseClient | null = null;

/**
 * E2E-only session storage: plain synchronous JS memory. Every bridged-async
 * module call (expo-clipboard reads, legacy file-system reads, and the
 * SecureStore writes this client would otherwise persist the adopted session
 * with) has stalled indefinitely on the iOS 26.4 CI simulator, stranding the
 * app before the auth event that drives e2e navigation could fire. e2e flows
 * are single cold launches, so in-memory persistence is enough — the runtime
 * token is adopted once per launch. Production keeps Keychain-backed chunks.
 */
const e2eMemoryStorage = (() => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string): string | null => store.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      store.set(key, value);
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
  };
})();

/**
 * The app's one Supabase client. The session lives in secure storage and
 * refreshes only while the app is in the foreground. A build without a
 * configured project still boots (to its sign-in screen) on a placeholder.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const c = createClient(env.supabaseUrl || 'https://placeholder.supabase.co', env.supabaseAnonKey || 'placeholder', {
    auth: {
      storage: env.e2e ? e2eMemoryStorage : chunkedSecureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // OAuth returns ?code= to bonamind://auth/callback (the implicit flow's
      // #access_token fragment can't be exchanged by the app).
      flowType: 'pkce',
    },
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active') c.auth.startAutoRefresh();
    else c.auth.stopAutoRefresh();
  });
  client = c;
  return c;
}

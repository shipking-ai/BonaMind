import { isDesktopApp, isNativeApp } from './platform';

/**
 * How each surface signs in, and where an auth link comes back to.
 *
 * The website and the Windows app use the code flow (PKCE): a link carries a
 * one-time code that only works in the browser holding the secret that
 * started the flow, and sessions are never built from tokens in the address.
 * Supabase recommends it for browser apps.
 *
 * The trade-off: a reset or sign-up confirmation link has to be opened in the
 * browser that asked for it (CallbackPage says so in plain words otherwise).
 *
 * The phone apps keep the implicit flow. They sign in with a password, no
 * auth link comes back into them, and their own confirmation emails open on
 * the website, which doesn't hold the app's secret.
 */
export function authClientOptions(): { auth: { flowType: 'pkce' | 'implicit' } } {
  const phoneApp = isNativeApp() && !isDesktopApp();
  return { auth: { flowType: phoneApp ? 'implicit' : 'pkce' } };
}

/**
 * The address an auth link should come back to on this site.
 *
 * A code-flow link returns with `?code=` and nothing else, so a reset has to
 * say it is one: the callback sends it to "Set a new password" instead of the
 * dashboard.
 */
export function authCallbackUrl(kind?: 'recovery'): string {
  const base = `${window.location.origin}/auth/callback`;
  return kind === 'recovery' ? `${base}?type=recovery` : base;
}

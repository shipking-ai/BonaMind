import { afterEach, describe, expect, it } from 'vitest';
import {
  captureAndScrubOAuthUrl,
  capturedOAuthUrl,
  resetCapturedOAuthUrlForTests,
} from '../lib/oauthUrlHygiene';

/**
 * An auth link has to finish on the callback page wherever Supabase sends it.
 *
 * Supabase only honours the app's `redirectTo` when the address is on its
 * Redirect URLs list. When it isn't, Supabase sends the user to the project's
 * Site URL instead: the home page. On 2026-11-09 the list had
 * `https://www.bonamind.app/auth/callback` but not the bare
 * `https://bonamind.app/auth/callback` the site actually uses, so every
 * password-reset link ended on the landing page. The user was signed in by
 * the token in the address, but never shown "Set a new password".
 *
 * The boot cleanup now moves any auth return to /auth/callback, which
 * already knows where each flow goes (recovery to the password screen) and
 * how to show an expired link.
 */

afterEach(() => {
  resetCapturedOAuthUrlForTests();
  window.history.replaceState(null, '', 'http://localhost:3000/');
});

function boot(at: string) {
  window.history.replaceState(null, '', at);
  captureAndScrubOAuthUrl();
}

describe('auth return on a page other than /auth/callback', () => {
  it('sends a reset link that landed on the home page to the callback', () => {
    boot('http://localhost:3000/#access_token=TOKEN&refresh_token=REFRESH&expires_in=3600&token_type=bearer&type=recovery');

    expect(window.location.pathname).toBe('/auth/callback');
    // Tokens still leave the address; the callback reads the memory copy.
    expect(window.location.href).not.toContain('TOKEN');
    expect(capturedOAuthUrl()).toContain('type=recovery');
  });

  it('sends a sign-in link that landed on the home page to the callback', () => {
    boot('http://localhost:3000/#access_token=TOKEN&refresh_token=REFRESH&type=magiclink');

    expect(window.location.pathname).toBe('/auth/callback');
  });

  it('sends an expired link to the callback with its error, so the user is told', () => {
    boot('http://localhost:3000/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=');

    expect(window.location.pathname).toBe('/auth/callback');
    expect(window.location.hash).toContain('error_description=Email+link+is+invalid+or+has+expired');
  });

  it('leaves the callback itself where it is', () => {
    boot('http://localhost:3000/auth/callback?code=abc123');

    expect(window.location.pathname).toBe('/auth/callback');
    expect(window.location.search).toBe('?code=abc123');
  });

  it('leaves ordinary pages alone, including ones with a type filter or an anchor', () => {
    boot('http://localhost:3000/library?type=pdf');
    expect(window.location.pathname + window.location.search).toBe('/library?type=pdf');

    boot('http://localhost:3000/about#pricing');
    expect(window.location.pathname + window.location.hash).toBe('/about#pricing');

    boot('http://localhost:3000/dashboard?code=ABC');
    expect(window.location.pathname).toBe('/dashboard');
  });
});

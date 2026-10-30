import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/database/supabase';
import { capturedOAuthUrl } from '../../lib/oauthUrlHygiene';
import { hasCompletedOnboarding } from '../../lib/onboardingGate';
import { Loader2, Check, AlertTriangle } from '@/components/icons';

const CallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    const handleOAuthCallback = async () => {
      // The pre-scrub copy of the URL (see oauthUrlHygiene): the token bytes
      // the flow travels in were wiped from the address bar at boot so no
      // telemetry snapshot can ever hold them. This page consumes the copy.
      const source = capturedOAuthUrl() || window.location.search + window.location.hash;

      // Benign navigation hints (code/type/error descriptions) — never:
      // with a PKCE client, tokens do not belong in the URL and the page
      // below does not read any access_token/refresh_token from it.
      const params = new URLSearchParams(source.replace(/^[^?#]*/, ''));
      const isRecovery = params.get('type') === 'recovery';

      const oauthError = params.get('error');
      const errorDescription = params.get('error_description');

      if (oauthError) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(errorDescription || oauthError);
        }
        return;
      }

      if (!supabase) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg('Authentication service not configured.');
        }
        return;
      }

      try {
        // exchangeCodeForSession() is the PKCE callback handler. It parses
        // the code from the captured URL and establishes a session.
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          source.replace(/^[^?#]*/, ''),
        );

        if (exchangeError) {
          // Code may have already been consumed — fall back to checking existing session
          console.warn('OAuth exchange attempt, falling back to getSession:', exchangeError.message);
          const {
            data: { session: existingSession },
            error: sessionError,
          } = await supabase.auth.getSession();

          if (sessionError) throw sessionError;

          if (existingSession && !cancelled) {
            setStatus('success');
            const metadata = existingSession.user?.user_metadata;
            setTimeout(
              () =>
                navigate(
                  hasCompletedOnboarding(metadata) ? '/dashboard' : '/onboarding',
                  { replace: true },
                ),
              800,
            );
            return;
          }

          if (!cancelled) {
            setStatus('error');
            setErrorMsg(exchangeError.message || 'Authentication failed. Please try again.');
          }
          return;
        }

        if (data?.session && !cancelled) {
          setStatus('success');
          // A recovery link lands on the password-change screen; a fresh
          // signup that confirmed their email goes to onboarding for the
          // role + topic step before the plan; returning users skip it.
          const metadata = data.session.user?.user_metadata;
          setTimeout(
            () =>
              navigate(
                isRecovery
                  ? '/reset-password?mode=update'
                  : hasCompletedOnboarding(metadata) ? '/dashboard' : '/onboarding',
                { replace: true },
              ),
            800,
          );
        } else if (!cancelled) {
          setStatus('error');
          setErrorMsg('Could not establish session. Please try signing in again.');
        }
      } catch (err: any) {
        console.error('OAuth callback error:', err);
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(err.message || 'An unexpected error occurred.');
        }
      }
    };

    handleOAuthCallback();

    return () => {
      cancelled = true;
    };
  }, [navigate, location]);

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
      <div className="text-center max-w-sm px-6">
        {status === 'processing' && (
          <>
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#7C3AED]/10 flex items-center justify-center">
              <Loader2 size={28} className="text-[#7C3AED] animate-spin" />
            </div>
            <h2 className="text-[#F0EFFE] text-lg font-light tracking-tight mb-2">Signing you in</h2>
            <p className="text-[#7A7A96] text-xs">Completing authentication, one moment...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Check size={28} className="text-emerald-400" />
            </div>
            <h2 className="text-[#F0EFFE] text-lg font-light tracking-tight mb-2">Signed in!</h2>
            <p className="text-[#7A7A96] text-xs">Redirecting to your dashboard...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={28} className="text-red-400" />
            </div>
            <h2 className="text-[#F0EFFE] text-lg font-light tracking-tight mb-2">Sign-in failed</h2>
            <p className="text-[#7A7A96] text-xs mb-6">{errorMsg || 'Authentication failed. Please try again.'}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate('/auth', { replace: true })}
                className="px-5 py-2 bg-[#7C3AED] text-white text-xs font-medium rounded-lg hover:bg-[#6D28D9] transition-all"
              >
                Try again
              </button>
              <button
                onClick={() => navigate('/', { replace: true })}
                className="px-5 py-2 bg-[#111118] border border-[#2A2A3A] text-[#F0EFFE] text-xs font-medium rounded-lg hover:border-[#3A3A4F] transition-all"
              >
                Go home
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CallbackPage;

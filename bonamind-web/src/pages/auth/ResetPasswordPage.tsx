import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle, Loader2, Lock } from '@/components/icons';
import { supabase } from '../../services/database/supabase';
import TurnstileWidget, { isTurnstileEnabled, type TurnstileHandle } from '../../components/auth/TurnstileWidget';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');

  const [email, setEmail] = useState('');
  // Only the "send reset link" form is captcha-gated: resetPasswordForEmail
  // is an unauthenticated endpoint Supabase protects. The update-password
  // form runs inside a recovery session and is not gated.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle | null>(null);
  const handleCaptchaToken = useCallback((t: string | null) => setCaptchaToken(t), []);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updated, setUpdated] = useState(false);

  // Update password mode (after clicking email link)
  useEffect(() => {
    if (mode === 'update') {
      supabase?.auth.getSession().then(({ data }) => {
        if (!data.session) navigate('/auth');
      });
    }
  }, [mode, navigate]);

  const handleReset = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Enter your email'); return; }
    setSending(true);
    setError('');
    try {
      if (!supabase) { setError('Not connected'); return; }
      const { error: sendError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        ...(captchaToken ? { captchaToken } : {}),
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (sendError) {
        setError(sendError.message);
        // The token was consumed by the attempt; reset so a retry gets a
        // fresh one instead of failing as captcha_failed.
        turnstileRef.current?.reset();
        return;
      }
      setSent(true);
    } catch {
      setError('Something went wrong');
      turnstileRef.current?.reset();
    } finally {
      setSending(false);
    }
  }, [email, captchaToken]);

  const handleUpdatePassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) { setError('Enter a new password'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setUpdating(true);
    setError('');
    try {
      if (!supabase) { setError('Not connected'); return; }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) { setError(updateError.message); return; }
      setUpdated(true);
    } catch {
      setError('Something went wrong');
    } finally {
      setUpdating(false);
    }
  }, [password, confirmPassword]);

  // Update password success view
  if (updated) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
            <CheckCircle size={28} className="text-emerald-400" />
          </div>
          <h1 className="text-[#F0EFFE] text-lg font-light">Password updated</h1>
          <p className="text-[#7A7A96] text-xs">Your password has been changed successfully</p>
          <button onClick={() => navigate('/dashboard')} className="px-5 py-2.5 bg-[#7C3AED] text-white text-xs font-medium rounded-xl hover:bg-[#6D28D9] transition-all">
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }

  // Update password form
  if (mode === 'update') {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <h1 className="text-[#F0EFFE] text-lg font-light">Set new password</h1>
            <p className="text-[#7A7A96] text-xs">Enter your new password below</p>
          </div>

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7A96]" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="New password"
                className="w-full bg-[#111118] border border-[#2A2A3A] rounded-xl pl-9 pr-4 py-3 text-[#F0EFFE] text-sm placeholder-[#7A7A96] outline-none focus:border-[#7C3AED]/50"
              />
            </div>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7A96]" />
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full bg-[#111118] border border-[#2A2A3A] rounded-xl pl-9 pr-4 py-3 text-[#F0EFFE] text-sm placeholder-[#7A7A96] outline-none focus:border-[#7C3AED]/50"
              />
            </div>

            {error && <p className="text-red-400 text-[11px]">{error}</p>}

            <button
              type="submit"
              disabled={updating}
              className="w-full py-3 bg-[#7C3AED] text-white text-sm font-medium rounded-xl hover:bg-[#6D28D9] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {updating && <Loader2 size={14} className="animate-spin" />}
              {updating ? 'Updating...' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Send reset email view
  if (sent) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-14 h-14 rounded-full bg-[#7C3AED]/10 flex items-center justify-center mx-auto">
            <CheckCircle size={28} className="text-[#8B5CF6]" />
          </div>
          <h1 className="text-[#F0EFFE] text-lg font-light">Check your email</h1>
          <p className="text-[#7A7A96] text-xs">We sent a password reset link to <span className="text-[#F0EFFE]">{email}</span></p>
          <button onClick={() => navigate('/auth')} className="text-[#8B5CF6] text-xs font-medium hover:text-[#7C3AED] transition-colors">
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <button onClick={() => navigate('/auth')} className="flex items-center gap-2 text-[#7A7A96] hover:text-[#F0EFFE] text-xs transition-colors">
          <ArrowLeft size={14} /> Back
        </button>

        <div className="space-y-2">
          <h1 className="text-[#F0EFFE] text-lg font-light">Reset password</h1>
          <p className="text-[#7A7A96] text-xs">Enter your email and we'll send you a recovery link</p>
        </div>

        <form onSubmit={handleReset} className="space-y-4">
          <div className="relative">
            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7A96]" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-[#111118] border border-[#2A2A3A] rounded-xl pl-9 pr-4 py-3 text-[#F0EFFE] text-sm placeholder-[#7A7A96] outline-none focus:border-[#7C3AED]/50"
            />
          </div>

          {error && <p className="text-red-400 text-[11px]">{error}</p>}

          <TurnstileWidget
            onToken={handleCaptchaToken}
            handleRef={turnstileRef}
            className="flex justify-center"
          />

          <button
            type="submit"
            disabled={sending || (isTurnstileEnabled() && !captchaToken)}
            className="w-full py-3 bg-[#7C3AED] text-white text-sm font-medium rounded-xl hover:bg-[#6D28D9] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {sending && <Loader2 size={14} className="animate-spin" />}
            {sending ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
      </div>
    </div>
  );
}

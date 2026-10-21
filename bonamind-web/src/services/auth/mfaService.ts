/**
 * Two-factor authentication (TOTP) via Supabase MFA.
 *
 * Flow:
 *  - Enroll (Settings): mfa.enroll → user scans QR / types secret →
 *    mfa.challenge + mfa.verify with the first code → factor active.
 *  - Sign-in (AuthPage): password sign-in returns an aal1 session; when the
 *    user has factors, getAuthenticatorAssuranceLevel().nextLevel === 'aal2'
 *    and the UI must run challenge + verify before the session is trusted.
 */
import { requireSupabase } from '../../services/database/supabase';

export interface MfaFactor {
  id: string;
  friendlyName?: string;
  status: string;
  created_at?: string;
}

export async function listFactors(): Promise<MfaFactor[]> {
  const { data, error } = await requireSupabase().auth.mfa.listFactors();
  if (error) throw error;
  return ((data?.totp as unknown) as MfaFactor[]) || [];
}

export async function hasFactors(): Promise<boolean> {
  try {
    return (await listFactors()).length > 0;
  } catch {
    return false;
  }
}

export interface EnrollResult {
  factorId: string;
  qrSvg: string;
  secret: string;
  uri: string;
}

/** Begins TOTP enrollment. The factor is NOT active until verifyEnrollment succeeds. */
export async function beginEnrollment(friendlyName = 'Authenticator app'): Promise<EnrollResult> {
  const { data, error } = await requireSupabase().auth.mfa.enroll({
    factorType: 'totp',
    friendlyName,
  });
  if (error) throw error;
  return {
    factorId: data.id,
    qrSvg: data.totp?.qr_code || '',
    secret: data.totp?.secret || '',
    uri: data.totp?.uri || '',
  };
}

/** Confirms enrollment with the 6-digit code from the authenticator app. */
export async function verifyEnrollment(factorId: string, code: string): Promise<void> {
  const { data: challenge, error: challengeError } = await requireSupabase().auth.mfa.challenge({ factorId });
  if (challengeError) throw challengeError;
  const { error: verifyError } = await requireSupabase().auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (verifyError) throw verifyError;
}

export async function unenroll(factorId: string): Promise<void> {
  const { error } = await requireSupabase().auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

/** True when the just-signed-in user must complete an MFA challenge. */
export async function needsMfaChallenge(): Promise<boolean> {
  const { data } = await requireSupabase().auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.nextLevel === 'aal2';
}

/** Completes the sign-in challenge. Throws on a bad code. */
export async function completeMfaChallenge(factorId: string, code: string): Promise<void> {
  const supabase = requireSupabase();
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError) throw challengeError;
  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (verifyError) throw verifyError;
}

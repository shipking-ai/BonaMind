/**
 * Pins for the re-hardened weekly-XP RPC (a human must apply the migration;
 * the AI never touches production).
 *
 * Two defects shipped in the original: the on-conflict arithmetic re-added
 * the new TOTAL onto the stored total (weekly scores compounded ~2^calls),
 * and the per-call credit was whatever the client claimed. The rewritten
 * migration carries deltas, applies per-call and per-week caps server-side,
 * and keeps the "own row only" guard.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(__dirname, '../../..');
const MPS = path.join(REPO, 'supabase/migrations');

const caps = readFileSync(path.join(MPS, '20261030010000_league_weekly_xp_caps.sql'), 'utf8');
const original = readFileSync(path.join(MPS, '20260720120000_league_weekly_xp_rpc.sql'), 'utf8');

describe('the re-hardened weekly xp rpc', () => {
  it('enforces a per-call cap and a weekly ceiling, server-side', () => {
    expect(caps).toMatch(/LEAST\(p_xp_delta,\s*v_per_call_cap\)/);
    expect(caps).toMatch(/LEAST\(v_weekly_cap/);
    expect(caps).toMatch(/v_per_call_cap\s+INT\s*:=\s*200/);
    expect(caps).toMatch(/v_weekly_cap\s+INT\s*:=\s*2000/);
  });

  it('credits the delta exactly once (no compounding on conflict)', () => {
    // The bug shape: the row carried the aggregated new total (v_prev+delta)
    // INTO the insert, then the conflict added it onto the stored total
    // again. The corrected body carries the DELTA and has no aggregated
    // total variable at all.
    expect(caps).not.toMatch(/\bv_new_xp\b/);
    expect(caps).toMatch(/p_tier,\s*v_delta,\s*v_new_acc/);
  });

  it('keeps the protect-your-own-row guard', () => {
    expect(caps).toMatch(/p_user_id <> auth\.uid\(\)/);
  });

  it('stays one function with the same signature and executor-aware grants', () => {
    expect(caps).toMatch(/CREATE OR REPLACE FUNCTION public\.increment_weekly_xp/);
    expect(caps).toMatch(/SECURITY DEFINER/);
    expect(caps).toMatch(/GRANT EXECUTE .* TO authenticated/);
  });

  it('differs from the original migration only where intended', () => {
    // The original body shipped the compounding arithmetic; equality between
    // the two bodies would mean nothing changed.
    expect(caps).not.toContain(original.split('LANGUAGE plpgsql')[1]?.split('$$;')[0] ?? original);
  });
});

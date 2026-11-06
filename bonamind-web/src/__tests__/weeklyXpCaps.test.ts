/**
 * The weekly XP limits build on the current function from
 * 20260917000000_league_weekly_xp_atomic, so everything it already fixed has
 * to survive here.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const caps = readFileSync(path.join(MIGRATIONS, '20261030010000_league_weekly_xp_caps.sql'), 'utf8');

describe('weekly xp limits', () => {
  it('limits each call and each week', () => {
    expect(caps).toContain('v_delta := LEAST(p_xp_delta, 200)');
    expect(caps).toContain('LEAST(2000, m.weekly_xp + v_delta)');
  });

  it('adds the limited amount once, in one atomic upsert', () => {
    expect(caps).toContain('p_tier, v_delta, COALESCE(v_accuracy, 0)');
    expect(caps).toContain('RETURNING m.weekly_xp, m.accuracy_rate INTO v_new_xp, v_new_acc');
    expect(caps).not.toContain('SELECT COALESCE(accuracy_rate');
  });

  it('keeps the checks from the function it replaces', () => {
    expect(caps).toContain('auth.uid() IS NULL OR p_user_id <> auth.uid()');
    expect(caps).toContain('length(p_group_id) > 64');
    expect(caps).toContain(
      'REVOKE ALL ON FUNCTION public.increment_weekly_xp(UUID, TEXT, INT, INT, NUMERIC) FROM PUBLIC, anon',
    );
    expect(caps).toContain(
      'GRANT EXECUTE ON FUNCTION public.increment_weekly_xp(UUID, TEXT, INT, INT, NUMERIC) TO authenticated',
    );
  });
});

-- increment_weekly_xp, re-hardened.
--
-- Two defects against the original 20260720120000_league_weekly_xp_rpc.sql:
--
-- 1. DOUBLE CREDIT: the original UPSERT inserted (v_prev_xp + delta) as the
--    row's new total, and then ON CONFLICT did
--        weekly_xp = league_memberships.weekly_xp + EXCLUDED.weekly_xp
--    — adding the new TOTAL to the old total again. The weekly score
--    compounded exponentially with every call (call 3 credits ~4x the
--    session's XP, call 4 ~8x, ...). The arithmetic now lives in the
--    conflict update itself: the inserting path carries the DELTA, and the
--    update ADDS that delta once onto the stored total.
--
-- 2. FORGED AMOUNTS: the amount was client-supplied and uncapped; a
--    caller could send p_xp_delta = 999999 in one call and top every
--    league permanently. Per-call and per-week caps are now enforced
--    server-side (see the finds below); accuracy keeps its [0, 100] clamp
--    plus the same EMA.
--
-- Unchanged and still load-bearing:
--   - `p_user_id <> auth.uid()` raises: a caller can never credit anybody
--     but themselves (verified present since 20260720);
--   - single-statement upsert at READ COMMITTED, season auto-create, group
--     id and tier pass-through, executor grants.
--
-- Caps: 200 XP per call, 2,000 XP per week. Both constants are named
-- locally so a future issue can retune them with one line each.

CREATE OR REPLACE FUNCTION public.increment_weekly_xp(
  p_user_id      UUID,
  p_group_id     TEXT,
  p_tier         INT,
  p_xp_delta     INT,
  p_accuracy     NUMERIC
) RETURNS TABLE (
  weekly_xp      INT,
  accuracy_rate  REAL,
  group_id       TEXT,
  tier           INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id     TEXT;
  v_starts_at     TIMESTAMPTZ;
  v_ends_at       TIMESTAMPTZ;
  v_prev_acc      REAL;
  v_new_acc       REAL;
  v_delta         INT;
  v_per_call_cap  INT := 200;
  v_weekly_cap    INT := 2000;
BEGIN
  -- Defensive: only ever credit the calling user's own row.
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'cannot increment weekly XP for another user'
      USING ERRCODE = '42501';
  END IF;

  IF p_xp_delta IS NULL OR p_xp_delta < 0 THEN
    RAISE EXCEPTION 'xp_delta must be >= 0' USING ERRCODE = '22023';
  END IF;

  IF p_tier IS NULL OR p_tier < 1 OR p_tier > 10 THEN
    RAISE EXCEPTION 'tier must be in [1, 10]' USING ERRCODE = '22023';
  END IF;

  -- Server-side cap of a single session's credit: the client's number is a
  -- claim, not an input of record.
  v_delta := GREATEST(0, LEAST(p_xp_delta, v_per_call_cap));

  -- Mirror the currentSeasonId() convention used in src/types/league.ts:
  -- the season id is the ISO week label (e.g. '2026-W30'), Mon-anchored.
  v_season_id := to_char(NOW() AT TIME ZONE 'UTC', 'IYYY-"W"IW');

  -- Week starts Mon 00:00 UTC, ends Sun 23:59:59 UTC. Absolute timestamps so
  -- the leagues countdown can show "ends in 3d 4h".
  v_starts_at := date_trunc('week', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_ends_at   := v_starts_at + INTERVAL '7 days';

  -- Auto-create the season row if missing (idempotent).
  INSERT INTO public.league_seasons (id, starts_at, ends_at)
  VALUES (v_season_id, v_starts_at, v_ends_at)
  ON CONFLICT (id) DO NOTHING;

  -- Accuracy EMA: prior accuracy gets 70% weight, new sample 30%. Only the
  -- accuracy needs the previous value (the XP total now accrues in one
  -- authorized place below).
  SELECT COALESCE(accuracy_rate, 0)
  INTO v_prev_acc
  FROM public.league_memberships
  WHERE season_id = v_season_id
    AND user_id   = p_user_id;

  IF NOT FOUND THEN
    v_prev_acc := 0;
  END IF;

  v_new_acc := CASE
    WHEN p_accuracy IS NULL THEN v_prev_acc
    WHEN v_prev_acc = 0     THEN GREATEST(0, LEAST(100, p_accuracy))
    ELSE (0.7 * v_prev_acc + 0.3 * p_accuracy)::REAL
  END;
  v_new_acc := GREATEST(0, LEAST(100, v_new_acc))::REAL;

  -- One upsert. The insert path carries the clamped DELTA; the conflict
  -- path accrues ONCE onto the stored total, capped at the weekly ceiling.
  INSERT INTO public.league_memberships (
    season_id, user_id, league_group_id, tier, weekly_xp, accuracy_rate
  )
  VALUES (
    v_season_id, p_user_id, p_group_id, p_tier, v_delta, v_new_acc
  )
  ON CONFLICT (season_id, user_id) DO UPDATE
    SET weekly_xp     = LEAST(v_weekly_cap,
                              public.league_memberships.weekly_xp + EXCLUDED.weekly_xp),
        accuracy_rate = v_new_acc,
        league_group_id = EXCLUDED.league_group_id,
        tier          = EXCLUDED.tier,
        updated_at    = NOW();

  RETURN QUERY
  SELECT LEAST(v_weekly_cap,
               COALESCE((select lm.weekly_xp from public.league_memberships lm
                         where lm.season_id = v_season_id and lm.user_id = p_user_id), v_delta)),
         v_new_acc, p_group_id, p_tier;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_weekly_xp(UUID, TEXT, INT, INT, NUMERIC) TO authenticated;

-- Migration bookkeeping per project convention.
INSERT INTO schema_migrations (version, description)
VALUES ('20261030010000_league_weekly_xp_caps',
        'increment_weekly_xp: server-side per-call and weekly XP caps; fix the conflict-path double credit that compounded weekly totals')
ON CONFLICT (version) DO NOTHING;

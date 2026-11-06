-- League weekly XP: limit what one call and one week can add.
--
-- Same function as 20260917000000_league_weekly_xp_atomic, plus two limits:
-- 200 XP per call and 2,000 XP per week. A total already above the weekly
-- limit is left as it is.
--
-- IDEMPOTENT: CREATE OR REPLACE. Signature unchanged.

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
  v_season_id  TEXT;
  v_starts_at  TIMESTAMPTZ;
  v_accuracy   REAL;
  v_new_xp     INT;
  v_new_acc    REAL;
  v_delta      INT;
BEGIN
  IF auth.uid() IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'cannot increment weekly XP for another user'
      USING ERRCODE = '42501';
  END IF;

  IF p_xp_delta IS NULL OR p_xp_delta < 0 THEN
    RAISE EXCEPTION 'xp_delta must be >= 0' USING ERRCODE = '22023';
  END IF;

  IF p_tier IS NULL OR p_tier < 1 OR p_tier > 10 THEN
    RAISE EXCEPTION 'tier must be in [1, 10]' USING ERRCODE = '22023';
  END IF;

  IF p_group_id IS NULL OR length(p_group_id) = 0 OR length(p_group_id) > 64 THEN
    RAISE EXCEPTION 'group_id is required' USING ERRCODE = '22023';
  END IF;

  -- At most 200 XP per call and 2,000 XP per week, whatever the client sends.
  v_delta := LEAST(p_xp_delta, 200);

  -- ISO week label, matching currentSeasonId() in src/types/league.ts.
  v_season_id := to_char(NOW() AT TIME ZONE 'UTC', 'IYYY-"W"IW');
  v_starts_at := date_trunc('week', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  INSERT INTO public.league_seasons (id, starts_at, ends_at)
  VALUES (v_season_id, v_starts_at, v_starts_at + INTERVAL '7 days')
  ON CONFLICT (id) DO NOTHING;

  v_accuracy := CASE
    WHEN p_accuracy IS NULL THEN NULL
    ELSE GREATEST(0, LEAST(100, p_accuracy))::REAL
  END;

  INSERT INTO public.league_memberships AS m (
    season_id, user_id, league_group_id, tier, weekly_xp, accuracy_rate
  )
  VALUES (
    v_season_id, p_user_id, p_group_id, p_tier, v_delta, COALESCE(v_accuracy, 0)
  )
  ON CONFLICT (season_id, user_id) DO UPDATE
    SET weekly_xp       = GREATEST(m.weekly_xp, LEAST(2000, m.weekly_xp + v_delta)),
        -- EMA: prior accuracy 70%, new sample 30%; first sample taken as-is.
        accuracy_rate   = CASE
                            WHEN v_accuracy IS NULL THEN m.accuracy_rate
                            WHEN m.accuracy_rate = 0 THEN v_accuracy
                            ELSE GREATEST(0, LEAST(100, 0.7 * m.accuracy_rate + 0.3 * v_accuracy))::REAL
                          END,
        league_group_id = EXCLUDED.league_group_id,
        tier            = EXCLUDED.tier,
        updated_at      = NOW()
  RETURNING m.weekly_xp, m.accuracy_rate INTO v_new_xp, v_new_acc;

  RETURN QUERY SELECT v_new_xp, v_new_acc, p_group_id, p_tier;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_weekly_xp(UUID, TEXT, INT, INT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_weekly_xp(UUID, TEXT, INT, INT, NUMERIC) TO authenticated;

-- ── Bookkeeping ─────────────────────────────────────────────────────────
INSERT INTO schema_migrations (version, description)
VALUES (
  '20261030010000_league_weekly_xp_caps',
  'increment_weekly_xp limits credit to 200 XP per call and 2,000 XP per week'
)
ON CONFLICT (version) DO NOTHING;

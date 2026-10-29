-- League roster names, resolved inside Postgres.
--
-- Why: user_profiles is locked to own-profile reads (20260709_core_tables.sql),
-- so the leaderboard could not resolve other members' names and showed every
-- peer as "Learner". league_memberships is world-readable, but opening
-- user_profiles up was never an option — this SECURITY DEFINER function is
-- the scoped escape hatch:
--
--   supabase.rpc('league_group_roster', { p_group_id, p_season_id })
--
-- It returns display name + avatar ONLY for members of a group the caller
-- themselves belong to (the exists() gate). Any other group id yields an
-- empty roster. Display name falls back to the email local-part, mirroring
-- the previous client-side behaviour.

create or replace function public.league_group_roster(p_group_id text, p_season_id text)
returns table (user_id uuid, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id,
         coalesce(
           nullif(up.full_name, ''),
           split_part(up.email, '@', 1),
           'Learner'
         ) as display_name,
         up.avatar_url
  from public.league_memberships m
  left join public.user_profiles up on up.user_id = m.user_id
  where m.league_group_id = p_group_id
    and m.season_id = p_season_id
    and exists (
      select 1
      from public.league_memberships caller
      where caller.league_group_id = p_group_id
        and caller.season_id = p_season_id
        and caller.user_id = auth.uid()
    );
$$;

revoke execute on function public.league_group_roster(text, text) from public, anon;
grant execute on function public.league_group_roster(text, text) to authenticated;

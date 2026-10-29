/**
 * League Service — orchestrates weekly competitions.
 *
 * Reads:
 *   - league_memberships (current season)
 *   - user_profiles (last week's tier from past seasons)
 *
 * Writes (only through the increment_weekly_xp RPC; RLS has no write policy):
 *   - Creates the user's row for the current week on first award
 *   - Adds weekly_xp on each study session
 *
 * Falls back to local-only computation when Supabase is offline; the UI
 * degrades gracefully (user still sees their tier + position locally).
 */

import { supabase } from '../database/supabase';
import {
  LEAGUE_TIERS,
  LEAGUE_GROUP_SIZE,
  PROMOTION_COUNT,
  DEMOTION_COUNT,
  type LeagueGroupView,
  type LeagueMemberView,
  type LeagueMembership,
  currentSeasonId,
  currentWeekBounds,
  leagueGroupIdFor,
  tierForLifetimeXp,
  getTierById,
} from '../../types/league';

export interface LeagueBoardData {
  seasonId: string;
  currentUserTier: number;
  currentUserGroupId?: string;
  currentUserRank?: number;
  /**
   * Only the caller's own group: names are obtainable solely through the
   * league_group_roster RPC, which is gated to groups the caller belongs to.
   * Other tiers' groups are deliberately omitted — rendering them would need
   * fabricated names. Empty array = a real, correct "no group yet" state.
   */
  groupsThisTier: LeagueGroupView[];
  weekStartsAt: number;
  weekEndsAt: number;
  /** Set when the board could not be read at all; never filled with fake players. */
  loadError?: string;
}

/** Local cache so the leaderboard renders instantly after first paint. */
const LOCAL_KEY_LEAGUE = 'bonamind_league_state_v1';

function readLocalLeague(): { seasonId: string; weeklyXp: number; tier: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_KEY_LEAGUE);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeLocalLeague(state: { seasonId: string; weeklyXp: number; tier: number }) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_KEY_LEAGUE, JSON.stringify(state));
  } catch {
    /* quota exceeded — ignore */
  }
}

/**
 * Award weekly XP to the current user. Each call adds xpDelta once, so call
 * it once per finished session. Returns the user's current weekly XP and rank within their own group.
 */
export async function awardWeeklyXp(
  userId: string,
  lifetimeXp: number,
  xpDelta: number,
  accuracy: number,
): Promise<{ weeklyXp: number; tier: number; groupId: string; rank?: number }> {
  const seasonId = currentSeasonId();
  const tier = tierForLifetimeXp(lifetimeXp);

  if (!supabase) {
    writeLocalLeague({ seasonId, weeklyXp: (readLocalLeague()?.weeklyXp ?? 0) + xpDelta, tier });
    return { weeklyXp: xpDelta, tier, groupId: '' };
  }

  try {
    // Read this week's existing memberships for this tier to size the group pool.
    const { data: tierRows, error: tierErr } = await supabase
      .from('league_memberships')
      .select('user_id, weekly_xp, accuracy_rate')
      .eq('season_id', seasonId)
      .eq('tier', tier);

    if (tierErr) throw tierErr;

    const totalUsersInTier = (tierRows?.length ?? 0) + 1;
    const groupId = leagueGroupIdFor(userId, tier, seasonId, totalUsersInTier);

    // The RPC is the only writer: it creates the season if needed and adds
    // the delta to the stored total in one atomic statement. A direct upsert
    // here would replace the running total with this session's XP.
    const { data: rpcRows, error: rpcErr } = await supabase.rpc('increment_weekly_xp', {
      p_user_id: userId,
      p_group_id: groupId,
      p_tier: tier,
      p_xp_delta: Math.max(0, Math.round(xpDelta)),
      p_accuracy: Math.max(0, Math.min(100, accuracy)),
    });

    if (rpcErr) throw rpcErr;
    const weeklyXp = (Array.isArray(rpcRows) ? rpcRows[0]?.weekly_xp : undefined) ?? xpDelta;

    // Compute rank within group.
    const peers = (tierRows ?? []).filter(r => r.user_id !== userId);
    const higherCount = peers.filter(p => (p.weekly_xp ?? 0) > weeklyXp).length;

    writeLocalLeague({ seasonId, weeklyXp, tier });

    return {
      weeklyXp,
      tier,
      groupId,
      rank: higherCount + 1,
    };
  } catch (_e) {
    // Fallback local-only path so we never break the UI on DB hiccups.
    const local = readLocalLeague();
    const weeklyXp = (local?.weeklyXp ?? 0) + xpDelta;
    writeLocalLeague({ seasonId, weeklyXp, tier });
    return { weeklyXp, tier, groupId: '' };
  }
}

/**
 * Fetch the full league board for the current user.
 * Reads the user's tier, then every group in that tier for the current season.
 */
export async function fetchLeagueBoard(
  currentUserId?: string,
): Promise<LeagueBoardData> {
  const seasonId = currentSeasonId();
  const { startsAt, endsAt } = currentWeekBounds();

  if (!supabase || !currentUserId) {
    return {
      seasonId,
      currentUserTier: 0,
      groupsThisTier: [],
      weekStartsAt: startsAt,
      weekEndsAt: endsAt,
      loadError: 'league-unavailable',
    };
  }

  try {
    // Step 1: ascertain the current user's tier (from their lifetime XP bucket).
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('xp')
      .eq('user_id', currentUserId)
      .maybeSingle();

    const lifetimeXp = (profile?.xp as number | undefined) ?? 0;
    const currentUserTier = tierForLifetimeXp(lifetimeXp);

    // Step 2: read all membership rows in that tier for this season.
    const { data: rows, error } = await supabase
      .from('league_memberships')
      .select('id, user_id, league_group_id, tier, weekly_xp, accuracy_rate')
      .eq('season_id', seasonId)
      .eq('tier', currentUserTier);

    if (error) throw error;
    const memberships: LeagueMembership[] = (rows as LeagueMembership[]) ?? [];

    if (memberships.length === 0) {
      // Real empty state: the user has not been placed in a group this week.
      return {
        seasonId,
        currentUserTier,
        groupsThisTier: [],
        weekStartsAt: startsAt,
        weekEndsAt: endsAt,
      };
    }

    // Step 3: find the caller's own group, then resolve its names through the
    // SECURITY DEFINER roster RPC — user_profiles is own-read-only by RLS, so
    // the old direct read returned nothing and every peer fell back to
    // "Learner". The RPC returns names only for groups the caller belongs to;
    // other groups in the tier are deliberately left out (their member names
    // are not obtainable and must not be fabricated).
    let myGroupId: string | undefined;
    memberships.forEach(m => {
      if (m.user_id === currentUserId) myGroupId = m.league_group_id;
    });

    const groups: LeagueGroupView[] = [];
    let myRank: number | undefined;
    if (myGroupId) {
      const { data: roster, error: rosterError } = await supabase.rpc(
        'league_group_roster' as never,
        { p_group_id: myGroupId, p_season_id: seasonId } as never,
      );
      if (rosterError) throw rosterError;

      const nameOf = new Map<string, string>();
      const avatarOf = new Map<string, string>();
      ((roster ?? []) as { user_id: string; display_name: string; avatar_url: string | null }[]).forEach(p => {
        nameOf.set(p.user_id, p.display_name);
        if (p.avatar_url) avatarOf.set(p.user_id, p.avatar_url);
      });

      const members: LeagueMemberView[] = memberships
        .filter(m => m.league_group_id === myGroupId)
        .map(m => ({
          userId: m.user_id,
          name: nameOf.get(m.user_id) ?? 'Learner',
          avatar: avatarOf.get(m.user_id),
          weeklyXp: m.weekly_xp,
          accuracyRate: Number(m.accuracy_rate ?? 0),
          rank: 0,
          tier: m.tier,
          trend: 'same',
        }));

      members.sort((a, b) => b.weeklyXp - a.weeklyXp || b.accuracyRate - a.accuracyRate);
      members.forEach((m, i) => {
        m.rank = i + 1;
        m.isCurrentUser = m.userId === currentUserId;
        if (m.isCurrentUser) myRank = m.rank;
      });

      groups.push({
        groupId: myGroupId,
        tier: currentUserTier,
        members,
        currentUserRank: myRank,
        promotionZoneTop: PROMOTION_COUNT,
        relegationZoneBottom: LEAGUE_GROUP_SIZE - DEMOTION_COUNT + 1,
        weekStartsAt: startsAt,
        weekEndsAt: endsAt,
      });
    }

    return {
      seasonId,
      currentUserTier,
      currentUserGroupId: myGroupId,
      currentUserRank: myRank,
      groupsThisTier: groups,
      weekStartsAt: startsAt,
      weekEndsAt: endsAt,
    };
  } catch (err) {
    // Real error state: surface that the board is unavailable. Never fake
    // players — the demo board masked outages as a busy league. PostgREST
    // errors are plain { message } objects, not Error instances.
    return {
      seasonId,
      currentUserTier: 0,
      groupsThisTier: [],
      weekStartsAt: startsAt,
      weekEndsAt: endsAt,
      loadError: (err as { message?: string } | null)?.message ?? 'league-unavailable',
    };
  }
}

/**
 * Compute what tier a user will land in next week, based on their position
 * within their league group right now (read-only — does not persist).
 */
export function nextWeekTierPreview(
  currentTier: number,
  rankWithinGroup: number,
  totalInGroup: number,
): { willPromote: boolean; willDemote: boolean; nextTier: number } {
  const _tier = getTierById(currentTier);
  if (rankWithinGroup <= PROMOTION_COUNT && currentTier < LEAGUE_TIERS.length) {
    return { willPromote: true, willDemote: false, nextTier: currentTier + 1 };
  }
  if (rankWithinGroup > totalInGroup - DEMOTION_COUNT && currentTier > 1) {
    return { willPromote: false, willDemote: true, nextTier: currentTier - 1 };
  }
  return { willPromote: false, willDemote: false, nextTier: currentTier };
}

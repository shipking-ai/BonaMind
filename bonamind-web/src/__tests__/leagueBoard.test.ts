/**
 * Guards the league board against two shipped dishonesties:
 *
 * 1. Everyone else on the leaderboard showed as "Learner" — the service read
 *    user_profiles directly, but RLS only allows own-profile reads, so every
 *    peer name came back empty. Names must come from the league_group_roster
 *    SECURITY DEFINER RPC (migration 20261029130000).
 * 2. Any error or empty season rendered a synthetic group of fake players
 *    (buildDemoGroup: "Aurora", "Zen", "Pixel"…). Real empty and error states
 *    must carry no fabricated members at all.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, from } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../services/database/supabase', () => ({
  supabase: { from, rpc },
}));

vi.mock('../types/league', async importOriginal => {
  const actual = await importOriginal<typeof import('../types/league')>();
  return {
    ...actual,
    currentSeasonId: () => '2026-W44',
    currentWeekBounds: () => ({ startsAt: 1, endsAt: 2 }),
  };
});

import { fetchLeagueBoard } from '../services/gamification/leagueService';

const ROSTER = [
  { user_id: 'me', display_name: 'Me', avatar_url: null },
  { user_id: 'peer-1', display_name: 'Ana', avatar_url: null },
  { user_id: 'peer-2', display_name: 'Ravi', avatar_url: null },
];

const MEMBERSHIPS = [
  { id: 'm1', season_id: '2026-W44', user_id: 'me', league_group_id: 'g7', tier: 3, weekly_xp: 120, accuracy_rate: 90 },
  { id: 'm2', season_id: '2026-W44', user_id: 'peer-1', league_group_id: 'g7', tier: 3, weekly_xp: 300, accuracy_rate: 95 },
  { id: 'm3', season_id: '2026-W44', user_id: 'peer-2', league_group_id: 'g7', tier: 3, weekly_xp: 50, accuracy_rate: 80 },
  // A different group in the same tier — names are NOT obtainable for it.
  { id: 'm4', season_id: '2026-W44', user_id: 'stranger', league_group_id: 'g8', tier: 3, weekly_xp: 999, accuracy_rate: 99 },
];

/** Wire the two table reads: own profile (xp) and the tier's memberships. */
function mockReads(membershipsData: unknown, membershipsError: unknown = null) {
  from.mockImplementation((table: string) => {
    if (table === 'user_profiles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { xp: 5000 }, error: null }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: membershipsData, error: membershipsError }),
        }),
      }),
    };
  });
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

describe('fetchLeagueBoard', () => {
  it('resolves peer names through the roster RPC, not a direct profile read', async () => {
    mockReads(MEMBERSHIPS);
    rpc.mockResolvedValue({ data: ROSTER, error: null });

    const board = await fetchLeagueBoard('me');

    expect(rpc).toHaveBeenCalledWith('league_group_roster', { p_group_id: 'g7', p_season_id: '2026-W44' });
    expect(board.currentUserGroupId).toBe('g7');
    const names = board.groupsThisTier[0].members.map(m => m.name).sort();
    expect(names).toEqual(['Ana', 'Me', 'Ravi']);
    // Ranks follow weekly XP: Ana 300, me 120, Ravi 50.
    const byRank = board.groupsThisTier[0].members.slice().sort((a, b) => a.rank - b.rank);
    expect(byRank.map(m => m.userId)).toEqual(['peer-1', 'me', 'peer-2']);
  });

  it('never includes groups the roster cannot name (no "Learner" fabrication)', async () => {
    mockReads(MEMBERSHIPS);
    rpc.mockResolvedValue({ data: ROSTER, error: null });

    const board = await fetchLeagueBoard('me');

    expect(board.groupsThisTier).toHaveLength(1);
    expect(board.groupsThisTier[0].groupId).toBe('g7');
    expect(board.groupsThisTier.flatMap(g => g.members.map(m => m.userId))).not.toContain('stranger');
    expect(board.groupsThisTier.flatMap(g => g.members.map(m => m.name))).not.toContain('Learner');
  });

  it('returns a real empty state when the user has no membership', async () => {
    mockReads([]);

    const board = await fetchLeagueBoard('me');

    expect(board.groupsThisTier).toEqual([]);
    expect(board.loadError).toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('surfaces roster errors instead of demo players', async () => {
    mockReads(MEMBERSHIPS);
    rpc.mockResolvedValue({ data: null, error: { message: 'RLS said no' } });

    const board = await fetchLeagueBoard('me');

    expect(board.loadError).toBe('RLS said no');
    expect(board.groupsThisTier).toEqual([]);
  });

  it('surfaces read errors instead of demo players', async () => {
    mockReads(null, { message: 'network down' });

    const board = await fetchLeagueBoard('me');

    expect(board.loadError).toBe('network down');
    expect(board.groupsThisTier).toEqual([]);
  });
});

describe('the league roster migration a human must apply', () => {
  const REPO = path.resolve(__dirname, '../../..');

  it('exists and follows the security-definer lockdown convention', () => {
    const sql = readFileSync(
      path.join(REPO, 'supabase/migrations/20261029130000_league_group_roster.sql'),
      'utf8',
    );
    expect(sql).toMatch(/create or replace function public\.league_group_roster/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/caller\.user_id = auth\.uid\(\)/);
    expect(sql).toMatch(/revoke execute .* from public, anon/);
    expect(sql).toMatch(/grant execute .* to authenticated/);
  });

  it('the service no longer ships a demo board', () => {
    const src = readFileSync(
      path.join(REPO, 'bonamind-web/src/services/gamification/leagueService.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/buildDemoGroup|buildFallbackBoard/);
    expect(src).not.toMatch(/Aurora/);
  });
});

/**
 * Red-team regression for public realtime channels: the notification,
 * shared-study and flow-presence channels were joined with PUBLIC broadcast
 * config, so anyone holding the public anon key could subscribe to
 * (and forged-broadcast into) any user's notification topic by guessing
 * their user id.
 *
 * Every channel is now private: access is decided by realtime RLS policies
 * on realtime.messages (migration 20261030000000), evaluated against the
 * caller's JWT. The policy set:
 *
 *   user:<uid>:notifications -> owner only (server publishes w/ service role)
 *   study:<deckId>           -> deck owner or a public deck (read + insert)
 *   flow:presence            -> any authenticated user (presence only)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('the private channel wiring', () => {
  const files: Record<string, string> = {
    notifications: readFileSync(
      path.resolve(__dirname, '../services/notifications/realtimeNotifications.ts'),
      'utf8',
    ),
    multiplayer: readFileSync(path.resolve(__dirname, '../hooks/useMultiplayerStudy.ts'), 'utf8'),
    flow: readFileSync(path.resolve(__dirname, '../components/study/FlowMode.tsx'), 'utf8'),
  };

  it('every realtime channel joins with private: true', () => {
    for (const [name, src] of Object.entries(files)) {
      expect(src, `${name} channel must be private`).toMatch(/private:\s*true/);
    }
  });

  it('the notification channel keeps its owner-scoped topic and no client sends', () => {
    const src = files.notifications;
    expect(src).toMatch(/user:\$\{userId\}:notifications/);
    // The client only listens; publishes come from the server (service role).
    expect(src).not.toMatch(/\.send\(/);
  });

  it('the deprecated public-channel rationale is gone', () => {
    expect(files.notifications).not.toMatch(/channels are PUBLIC|No private-channel RLS/);
  });
});

describe('the realtime policies (a human must apply them)', () => {
  const sql = readFileSync(
    path.resolve(__dirname, '../../../supabase/migrations/20261030000000_private_realtime_channels.sql'),
    'utf8',
  );

  it('covers all three topic families', () => {
    expect(sql).toMatch(/'user:' \|\| \(select auth\.uid\(\)\)::text \|\| ':%'/);
    expect(sql).toMatch(/'study:%'/);
    expect(sql).toMatch(/'flow:presence'/);
  });

  it('never alters the protected table (the 42501 trap from the reverted attempt)', () => {
    // ALTER TABLE realtime.messages fails with "must be owner" and aborts the
    // whole migration — the 20260721 attempt shipped that bug.
    expect(sql).not.toMatch(/alter table\s+.*realtime\.messages/i);
    expect(sql).toMatch(/create policy/);
  });

  it('insert rights are scoped per topic family, never granted blindly', () => {
    const insertPolicies = sql.match(/for insert[\s\S]*?with check \(/g) ?? [];
    expect(insertPolicies.length).toBeGreaterThanOrEqual(2);
    // No policy lets a client broadcast into someone else's notifications.
    expect(sql).not.toMatch(
      /for insert[\s\S]{0,200}user:\$?\|[\s\S]{0,80}with check/i,
    );
  });
});

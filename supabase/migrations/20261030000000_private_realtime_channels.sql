-- Private Realtime channels: per-topic authorization on realtime.messages.
--
-- A previous attempt (20260721_realtime_messages_rls.sql) added an RLS
-- policy with an "ALTER TABLE ... ENABLE ROW LEVEL SECURITY" statement and
-- failed with "must be owner of table messages"; the fallback declared
-- public broadcast channels safe "because only server code publishes".
-- Neither half held: Realtime already keeps RLS enabled on that table —
-- only the ALTER is wrong — and public broadcast channels are writable by
-- anyone holding the public anon key, which turned notification topics
-- like "user:<uuid>:notifications" into a spoofable surface (finding:
-- a listener can read and a sender can forge any user's notifications).
--
-- This migration adds per-topic policies using the realtime.topic() helper.
-- Clients then join with config { private: true } on all three channel
-- families; the resulting checks run against the caller's JWT:
--
--   user:<uid>:notifications  notification topics — owner-only SELECT
--                             (clients never INSERT; the server publishes
--                             with the service role, which bypasses RLS)
--   study:<deckId>            co-study channels — owner or anyone on a
--                             public deck, for broadcast AND presence
--   flow:presence             global presence counter — any authenticated
--                             user, presence extension only
--
-- Constraint kept by a test: ALTER/ENABLE statements on realtime.messages
-- must never appear in this file — RLS is already enabled by the platform
-- and the ADD would abort the whole transaction (42501 owner error).
--
-- Requires the Realtime "Allow public access" dashboard setting to be
-- disabled for the private flag to be enforced; that flip is a human step.

-- ── user:<uid>:notifications — owner-only reads ──────────────────────────
create policy "owner reads own notification broadcasts"
on "realtime"."messages"
for select
to authenticated
using (
  realtime.topic() like 'user:' || (select auth.uid())::text || ':%'
  and realtime.messages.extension in ('broadcast')
);

-- ── study:<deckId> — deck participants, broadcast + presence ─────────────
create policy "deck participants watch the shared study channel"
on "realtime"."messages"
for select
to authenticated
using (
  realtime.topic() like 'study:%'
  and exists (
    select 1
    from public.decks d
    where d.id::text = substr(realtime.topic(), length('study:') + 1)
      and (d.user_id = (select auth.uid()) or d.is_public)
  )
  and realtime.messages.extension in ('broadcast', 'presence')
);

create policy "deck participants send broadcast and presence"
on "realtime"."messages"
for insert
to authenticated
with check (
  realtime.topic() like 'study:%'
  and exists (
    select 1
    from public.decks d
    where d.id::text = substr(realtime.topic(), length('study:') + 1)
      and (d.user_id = (select auth.uid()) or d.is_public)
  )
  and realtime.messages.extension in ('broadcast', 'presence')
);

-- ── flow:presence — any signed-in user, presence only ────────────────────
create policy "authenticated users track flow presence"
on "realtime"."messages"
for select
to authenticated
using (
  realtime.topic() = 'flow:presence'
  and realtime.messages.extension in ('presence')
);

create policy "authenticated users publish flow presence"
on "realtime"."messages"
for insert
to authenticated
with check (
  realtime.topic() = 'flow:presence'
  and realtime.messages.extension in ('presence')
);

-- Migration bookkeeping
INSERT INTO schema_migrations (version, description)
VALUES ('20261030000000_private_realtime_channels',
        'Per-topic authorization for private realtime channels (user notifications, shared study rooms, flow presence)')
ON CONFLICT (version) DO NOTHING;

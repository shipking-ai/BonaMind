-- Private Realtime channels: per-topic policies on realtime.messages.
--
-- Clients join with config { private: true } on all three channel families:
--
--   user:<uid>:notifications  owner reads; only the server publishes (the
--                             realtime-notify function, using the service role)
--   study:<deckId>            deck owner or anyone on a public deck, broadcast
--                             and presence
--   flow:presence             any signed-in user, presence only
--
-- Never ALTER realtime.messages here. The platform already enables RLS on it,
-- and the statement fails with 42501 (a test keeps it out of this file).
--
-- Rollout steps are in the pull request.
--
-- IDEMPOTENT: DROP POLICY IF EXISTS before each CREATE.

-- ── user:<uid>:notifications — owner-only reads ──────────────────────────
drop policy if exists "owner reads own notification broadcasts" on "realtime"."messages";
create policy "owner reads own notification broadcasts"
on "realtime"."messages"
for select
to authenticated
using (
  realtime.topic() like 'user:' || (select auth.uid())::text || ':%'
  and realtime.messages.extension in ('broadcast')
);

-- ── study:<deckId> — deck participants, broadcast + presence ─────────────
drop policy if exists "deck participants watch the shared study channel" on "realtime"."messages";
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

drop policy if exists "deck participants send broadcast and presence" on "realtime"."messages";
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
drop policy if exists "authenticated users track flow presence" on "realtime"."messages";
create policy "authenticated users track flow presence"
on "realtime"."messages"
for select
to authenticated
using (
  realtime.topic() = 'flow:presence'
  and realtime.messages.extension in ('presence')
);

drop policy if exists "authenticated users publish flow presence" on "realtime"."messages";
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

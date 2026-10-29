-- Per-deck card counts, resolved inside Postgres.
--
-- Why: PostgREST caps every request at 1000 rows. The settings-count path
-- used to fetch one row per card (`select deck_id .in(deck_id)`) across all
-- decks, so a big library loaded incompletely AND a long .in() list could
-- blow the URL limit. This function groups in the database instead:
--
--   supabase.rpc('deck_card_counts', { p_deck_ids: [...] })
--
-- SECURITY INVOKER (the default) so the caller's RLS on cards applies:
-- a user counts only their own rows because the filter pins auth.uid().
-- Following the executor-lockdown convention, grants are explicit.

create or replace function public.deck_card_counts(p_deck_ids uuid[])
returns table (deck_id uuid, cards bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.deck_id, count(*)::bigint as cards
  from public.cards c
  where c.user_id = auth.uid()
    and c.deck_id = any(p_deck_ids)
  group by c.deck_id;
$$;

revoke execute on function public.deck_card_counts(uuid[]) from public, anon;
grant execute on function public.deck_card_counts(uuid[]) to authenticated;

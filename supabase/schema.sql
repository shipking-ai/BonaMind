


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."stripe_order_status" AS ENUM (
    'pending',
    'completed',
    'canceled'
);


ALTER TYPE "public"."stripe_order_status" OWNER TO "postgres";


CREATE TYPE "public"."stripe_subscription_status" AS ENUM (
    'not_started',
    'incomplete',
    'incomplete_expired',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'paused'
);


ALTER TYPE "public"."stripe_subscription_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_class_deck"("p_assignment_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_assignment RECORD;
  v_local_deck_id UUID;
  v_local_title TEXT;
BEGIN
  SELECT id, classroom_id, kind, deck_id, deck_title, created_by
  INTO v_assignment
  FROM public.assignments WHERE id = p_assignment_id;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'accept_class_deck: assignment not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_class_member(v_assignment.classroom_id) THEN
    RAISE EXCEPTION 'accept_class_deck: caller is not a member of this class' USING ERRCODE = '42501';
  END IF;
  IF v_assignment.kind <> 'deck' OR v_assignment.deck_id IS NULL THEN
    RAISE EXCEPTION 'accept_class_deck: assignment is not a deck assignment' USING ERRCODE = '22000';
  END IF;
  -- The definer can read any deck, so re-check what create_assignment
  -- checked: the source deck must still belong to the assigning teacher.
  IF NOT EXISTS (
    SELECT 1 FROM public.decks
    WHERE id = v_assignment.deck_id AND user_id = v_assignment.created_by
  ) THEN
    RAISE EXCEPTION 'accept_class_deck: assigned deck is not owned by the assigning teacher' USING ERRCODE = '42501';
  END IF;

  -- Idempotent: reuse an existing local copy if the student already accepted.
  SELECT local_deck_id INTO v_local_deck_id
  FROM public.assignment_progress
  WHERE assignment_id = p_assignment_id AND user_id = v_uid;

  IF v_local_deck_id IS NULL THEN
    v_local_title := COALESCE(v_assignment.deck_title, 'Assigned deck') || ' (Class)';
    INSERT INTO public.decks (user_id, name, description, is_public, original_deck_id)
    VALUES (v_uid, v_local_title, 'Auto-copied from a class assignment', FALSE, v_assignment.deck_id)
    RETURNING id INTO v_local_deck_id;

    INSERT INTO public.cards (user_id, deck_id, front, back, source_type, trust_score, verified)
    SELECT v_uid, v_local_deck_id, front, back, COALESCE(source_type, 'classroom'), trust_score, verified
    FROM public.cards
    WHERE deck_id = v_assignment.deck_id
      AND user_id = v_assignment.created_by;
  END IF;

  INSERT INTO public.assignment_progress (assignment_id, classroom_id, user_id, local_deck_id, status)
  VALUES (p_assignment_id, v_assignment.classroom_id, v_uid, v_local_deck_id, 'assigned')
  ON CONFLICT (assignment_id, user_id) DO UPDATE
    SET local_deck_id = EXCLUDED.local_deck_id;

  RETURN jsonb_build_object(
    'deck_id', v_local_deck_id,
    'title', COALESCE(v_local_title, (SELECT name FROM public.decks WHERE id = v_local_deck_id))
  );
END;
$$;


ALTER FUNCTION "public"."accept_class_deck"("p_assignment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_events_handler"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Call the Edge Function via HTTP
  PERFORM http_post(
    'https://ndwiaawqkkzdsdqeglez.supabase.co/functions/v1/auth-hook',
    json_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', CASE TG_OP
        WHEN 'INSERT' THEN to_jsonb(NEW)
        WHEN 'UPDATE' THEN to_jsonb(NEW)
      END,
      'old_record', CASE TG_OP
        WHEN 'UPDATE' THEN to_jsonb(OLD)
        ELSE NULL
      END
    ),
    array['Content-Type: application/json']
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."auth_events_handler"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."avatar_upload_secure"("p_filename" "text", "p_mime_type" "text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
DECLARE
  v_safe_mime TEXT := LOWER(COALESCE(p_mime_type, ''));
  v_safe_name TEXT := REGEXP_REPLACE(p_filename, '[^a-zA-Z0-9._-]', '_', 'g');
BEGIN
  IF v_safe_mime NOT IN (
    'image/png','image/jpeg','image/jpg','image/webp',
    'image/gif','image/avif'
  ) THEN
    RETURN NULL;
  END IF;

  RETURN format('%s/%s', auth.uid()::text, v_safe_name);
END;
$$;


ALTER FUNCTION "public"."avatar_upload_secure"("p_filename" "text", "p_mime_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_user_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_user_id TEXT;
  v_payload JSONB;
  v_event TEXT;
  v_secret TEXT;
  v_headers JSONB := jsonb_build_object('Content-Type', 'application/json');
  v_edge_url CONSTANT TEXT := 'https://ndwiaawqkkzdsdqeglez.supabase.co/functions/v1/realtime-notify';
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'study_sessions' THEN
      v_user_id := NEW.user_id::TEXT;
      v_event := 'study_session_completed';
      v_payload := jsonb_build_object(
        'type', 'study_session',
        'event', v_event,
        'cards_studied', NEW.cards_studied,
        'duration_minutes', NEW.duration_ms / 60000,
        'accuracy', NEW.accuracy,
        'timestamp', extract(epoch from now()) * 1000
      );
    WHEN 'league_memberships' THEN
      v_user_id := NEW.user_id::TEXT;
      v_event := 'league_xp_changed';
      v_payload := jsonb_build_object(
        'type', 'league',
        'event', v_event,
        'weekly_xp', NEW.weekly_xp,
        'tier', NEW.tier,
        'league_group', NEW.league_group_id,
        'timestamp', extract(epoch from now()) * 1000
      );
    WHEN 'user_profiles' THEN
      v_user_id := NEW.user_id::TEXT;
      v_event := 'streak_updated';
      v_payload := jsonb_build_object(
        'type', 'profile',
        'event', v_event,
        'streak', NEW.streak,
        'timestamp', extract(epoch from now()) * 1000
      );
    ELSE
      RETURN NULL;
  END CASE;

  -- A notification is garnish on a write the user actually made; a Vault
  -- hiccup must never fail that write, so any error reading the secret just
  -- means the header is left off.
  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'realtime_notify_secret'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;
  IF v_secret IS NOT NULL THEN
    v_headers := v_headers || jsonb_build_object('x-webhook-secret', v_secret);
  END IF;

  -- body is jsonb (pg_net >= 0.14). Do NOT cast to text.
  PERFORM net.http_post(
    url := v_edge_url,
    headers := v_headers,
    body := jsonb_build_object(
      'channel', 'user:' || v_user_id || ':notifications',
      'event', 'broadcast',
      'payload', v_payload
    ),
    timeout_milliseconds := 5000
  );

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."broadcast_user_notification"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."broadcast_user_notification"() IS 'Realtime notification trigger fn. net.http_post body is jsonb (pg_net >= 0.14); never cast to text.';



CREATE OR REPLACE FUNCTION "public"."bump_forks_and_unpublish"("p_deck_id" "uuid", "p_unpublish" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_owner uuid;
BEGIN
  -- fork_count moves only through fork_public_deck(); a bare bump is a no-op.
  IF NOT p_unpublish THEN
    RETURN;
  END IF;

  SELECT user_id INTO v_owner FROM public.decks WHERE id = p_deck_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'deck not found' USING ERRCODE = 'P0002';
  ELSIF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'not deck owner' USING ERRCODE = '42501';
  END IF;

  UPDATE public.decks SET is_public = false WHERE id = p_deck_id;
END;
$$;


ALTER FUNCTION "public"."bump_forks_and_unpublish"("p_deck_id" "uuid", "p_unpublish" boolean) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "classroom_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "instructions" "text",
    "kind" "text" DEFAULT 'deck'::"text" NOT NULL,
    "deck_id" "uuid",
    "deck_title" "text",
    "deck_card_count" integer DEFAULT 0 NOT NULL,
    "payload" "jsonb",
    "start_at" timestamp with time zone,
    "due_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "assignments_check" CHECK ((("due_at" IS NULL) OR ("start_at" IS NULL) OR ("due_at" > "start_at"))),
    CONSTRAINT "assignments_kind_check" CHECK (("kind" = ANY (ARRAY['deck'::"text", 'quiz'::"text"]))),
    CONSTRAINT "assignments_title_check" CHECK ((("length"("title") >= 1) AND ("length"("title") <= 200)))
);


ALTER TABLE "public"."assignments" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classroom_quiz_assignment"("p_assignment_id" "uuid") RETURNS "public"."assignments"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_row public.assignments;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'quiz: anonymous caller' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.assignments WHERE id = p_assignment_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'quiz: assignment not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_class_member(v_row.classroom_id) THEN
    RAISE EXCEPTION 'quiz: caller is not a member of this class' USING ERRCODE = '42501';
  END IF;
  IF v_row.kind <> 'quiz' OR v_row.deck_id IS NULL THEN
    RAISE EXCEPTION 'quiz: assignment has no question deck' USING ERRCODE = '22000';
  END IF;
  -- Same rule accept_class_deck applies: only the assigning teacher's deck.
  IF NOT EXISTS (
    SELECT 1 FROM public.decks WHERE id = v_row.deck_id AND user_id = v_row.created_by
  ) THEN
    RAISE EXCEPTION 'quiz: deck is not owned by the assigning teacher' USING ERRCODE = '42501';
  END IF;
  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."classroom_quiz_assignment"("p_assignment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classroom_quiz_cards"("p_deck_id" "uuid", "p_owner" "uuid", "p_student" "uuid") RETURNS TABLE("card_id" "uuid", "front" "text", "back" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT c.id, c.front, c.back
  FROM public.cards c
  WHERE c.deck_id = p_deck_id
    AND c.user_id = p_owner
    AND coalesce(trim(c.front), '') <> ''
    AND coalesce(trim(c.back), '') <> ''
  ORDER BY md5(c.id::text || p_student::text)
  LIMIT 20;
$$;


ALTER FUNCTION "public"."classroom_quiz_cards"("p_deck_id" "uuid", "p_owner" "uuid", "p_student" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classroom_roster"("p_classroom_id" "uuid") RETURNS TABLE("user_id" "uuid", "display_name" "text", "email" "text", "role" "text", "joined_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_teacher BOOLEAN;
BEGIN
  IF NOT public.is_class_member(p_classroom_id) THEN
    RAISE EXCEPTION 'classroom_roster: caller is not a member' USING ERRCODE = '42501';
  END IF;
  v_teacher := public.is_class_teacher(p_classroom_id);

  RETURN QUERY
  SELECT cm.user_id,
         COALESCE(NULLIF(u.full_name, ''), u.email, cm.user_id::text) AS display_name,
         CASE WHEN v_teacher THEN u.email ELSE NULL END AS email,
         cm.role,
         cm.joined_at
  FROM public.classroom_memberships cm
  LEFT JOIN public.user_profiles u ON u.user_id = cm.user_id
  WHERE cm.classroom_id = p_classroom_id
  ORDER BY cm.role DESC, display_name ASC;
END;
$$;


ALTER FUNCTION "public"."classroom_roster"("p_classroom_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classroom_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."classroom_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_user_lapses"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_total INTEGER;
BEGIN
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'cannot count another user''s lapses' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(lapses), 0)::INTEGER INTO v_total
  FROM cards
  WHERE user_id = p_user_id;

  RETURN v_total;
END;
$$;


ALTER FUNCTION "public"."count_user_lapses"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_assignment"("p_classroom_id" "uuid", "p_title" "text", "p_instructions" "text" DEFAULT NULL::"text", "p_kind" "text" DEFAULT 'deck'::"text", "p_deck_id" "uuid" DEFAULT NULL::"uuid", "p_payload" "jsonb" DEFAULT NULL::"jsonb", "p_start_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_due_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS SETOF "public"."assignments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_deck_owner UUID;
  v_deck_title TEXT;
  v_card_count INTEGER;
  v_row public.assignments;
BEGIN
  IF NOT public.is_class_teacher(p_classroom_id) THEN
    RAISE EXCEPTION 'create_assignment: caller is not a teacher here' USING ERRCODE = '42501';
  END IF;
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'create_assignment: title is required' USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('deck', 'quiz') THEN
    RAISE EXCEPTION 'create_assignment: kind must be deck or quiz' USING ERRCODE = '22023';
  END IF;
  IF p_due_at IS NOT NULL AND p_start_at IS NOT NULL AND p_due_at <= p_start_at THEN
    RAISE EXCEPTION 'create_assignment: due_at must be after start_at' USING ERRCODE = '22023';
  END IF;

  -- Both kinds are built from a deck the teacher owns: a deck assignment
  -- copies it, a quiz draws its questions from it.
  IF p_kind IN ('deck', 'quiz') THEN
    IF p_deck_id IS NULL THEN
      RAISE EXCEPTION 'create_assignment: deck_id required' USING ERRCODE = '22023';
    END IF;
    SELECT user_id, name INTO v_deck_owner, v_deck_title
    FROM public.decks WHERE id = p_deck_id;
    IF v_deck_owner IS NULL THEN
      RAISE EXCEPTION 'create_assignment: deck not found' USING ERRCODE = 'P0002';
    ELSIF v_deck_owner <> v_uid THEN
      RAISE EXCEPTION 'create_assignment: you can only assign decks you own' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO v_card_count FROM public.cards WHERE deck_id = p_deck_id;
    IF p_kind = 'quiz' AND (
      SELECT count(DISTINCT back) FROM public.cards
      WHERE deck_id = p_deck_id AND user_id = v_uid AND coalesce(trim(back), '') <> ''
    ) < 2 THEN
      RAISE EXCEPTION 'create_assignment: a quiz deck needs at least two cards with different answers' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.assignments (
    classroom_id, created_by, title, instructions, kind,
    deck_id, deck_title, deck_card_count, payload, start_at, due_at
  )
  VALUES (
    p_classroom_id, v_uid, trim(p_title), NULLIF(p_instructions, ''), p_kind,
    p_deck_id, v_deck_title, COALESCE(v_card_count, 0), p_payload, p_start_at, p_due_at
  )
  RETURNING * INTO v_row;

  RETURN QUERY SELECT * FROM public.assignments WHERE id = v_row.id;
END;
$$;


ALTER FUNCTION "public"."create_assignment"("p_classroom_id" "uuid", "p_title" "text", "p_instructions" "text", "p_kind" "text", "p_deck_id" "uuid", "p_payload" "jsonb", "p_start_at" timestamp with time zone, "p_due_at" timestamp with time zone) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classrooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "subject" "text",
    "color" "text" DEFAULT 'violet'::"text" NOT NULL,
    "invite_code" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "classrooms_invite_code_check" CHECK (("invite_code" ~ '^[A-Z2-9]{6}$'::"text")),
    CONSTRAINT "classrooms_title_check" CHECK ((("length"("title") >= 1) AND ("length"("title") <= 200)))
);


ALTER TABLE "public"."classrooms" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_classroom"("p_title" "text", "p_description" "text" DEFAULT NULL::"text", "p_subject" "text" DEFAULT NULL::"text", "p_color" "text" DEFAULT 'violet'::"text") RETURNS SETOF "public"."classrooms"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.classrooms;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'create_classroom: anonymous caller has no auth.uid' USING ERRCODE = '42501';
  END IF;
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'create_classroom: title is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.classrooms (owner_id, title, description, subject, color, invite_code)
  VALUES (v_uid, trim(p_title), NULLIF(p_description, ''), NULLIF(p_subject, ''), COALESCE(NULLIF(p_color, ''), 'violet'), public.generate_class_invite_code())
  RETURNING * INTO v_row;

  -- The owner is the first teacher.
  INSERT INTO public.classroom_memberships (classroom_id, user_id, role)
  VALUES (v_row.id, v_uid, 'teacher');

  RETURN QUERY SELECT * FROM public.classrooms WHERE id = v_row.id;
END;
$$;


ALTER FUNCTION "public"."create_classroom"("p_title" "text", "p_description" "text", "p_subject" "text", "p_color" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_email_preferences_for_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  BEGIN
    INSERT INTO email_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'create_email_preferences_for_user skipped due to %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_email_preferences_for_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner', 'ceo', 'admin'),
    FALSE
  );
$$;


ALTER FUNCTION "public"."current_user_is_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."current_user_is_admin"() IS 'Admin check. Reads ONLY app_metadata.role from the verified JWT: user_metadata and public table columns are client-writable and must never be trusted for authorization. Roles are written by the service-role API (api/index.ts).';



CREATE OR REPLACE FUNCTION "public"."deactivate_admin"("target_user" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT is_super_admin(caller) THEN
    RAISE EXCEPTION 'Only super admins may deactivate admins';
  END IF;
  UPDATE admin_roles SET is_active = false, updated_at = now() WHERE user_id = target_user;
  RETURN 'deactivated';
END;
$$;


ALTER FUNCTION "public"."deactivate_admin"("target_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deck_card_counts"("p_deck_ids" "uuid"[]) RETURNS TABLE("deck_id" "uuid", "cards" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select c.deck_id, count(*)::bigint as cards
  from public.cards c
  where c.user_id = auth.uid()
    and c.deck_id = any(p_deck_ids)
  group by c.deck_id;
$$;


ALTER FUNCTION "public"."deck_card_counts"("p_deck_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_assignment"("p_assignment_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_class_id UUID;
BEGIN
  SELECT classroom_id INTO v_class_id FROM public.assignments WHERE id = p_assignment_id;
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'delete_assignment: assignment not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_class_teacher(v_class_id) THEN
    RAISE EXCEPTION 'delete_assignment: caller is not a teacher here' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.assignments WHERE id = p_assignment_id;
END;
$$;


ALTER FUNCTION "public"."delete_assignment"("p_assignment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_classroom"("p_classroom_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'delete_classroom: anonymous caller' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.classrooms
  WHERE id = p_classroom_id AND owner_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delete_classroom: only the owner can delete a classroom' USING ERRCODE = '42501';
  END IF;
END;
$$;


ALTER FUNCTION "public"."delete_classroom"("p_classroom_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_sql"("query_text" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result jsonb;
  normalized text;
BEGIN
  normalized := upper(btrim(query_text));

  -- Only allow read-style statements as the first keyword.
  IF NOT (normalized ~ '^[[:space:]]*(SELECT|EXPLAIN|SHOW|DESCRIBE|DESC|WITH)[[:space:](]') THEN
    RAISE EXCEPTION 'Only read-only queries (SELECT, EXPLAIN, SHOW, DESCRIBE, WITH) are allowed';
  END IF;

  -- Reject data-modifying keywords ANYWHERE (covers EXPLAIN ANALYZE <DML> and
  -- data-modifying CTEs such as `WITH x AS (DELETE ...) SELECT ...`).
  IF normalized ~ '(^|[^A-Z_0-9])[[:space:]]*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXECUTE|CALL|DO|MERGE|COPY|VACUUM|REINDEX|REFRESH|SECURITY)[[:space:]]' THEN
    RAISE EXCEPTION 'Data-modifying statements are not allowed';
  END IF;

  EXECUTE format('SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (%s) t', query_text) INTO result;
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."execute_sql"("query_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fork_public_deck"("p_deck_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_src         public.decks%ROWTYPE;
  v_new_deck    uuid;
  v_forked_before boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in to fork a deck' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_src FROM public.decks WHERE id = p_deck_id AND is_public = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck not found or not public' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.decks WHERE user_id = v_uid AND original_deck_id = p_deck_id
  ) INTO v_forked_before;

  INSERT INTO public.decks (user_id, name, description, original_deck_id, is_public)
  VALUES (
    v_uid,
    v_src.name,
    COALESCE(NULLIF(v_src.marketplace_description, ''), v_src.description),
    p_deck_id,
    false
  )
  RETURNING id INTO v_new_deck;

  -- Fresh scheduling for the new owner: due now, no review history.
  INSERT INTO public.cards (deck_id, user_id, front, back, source_type, next_review)
  SELECT v_new_deck, v_uid, c.front, c.back, c.source_type, now()
  FROM public.cards c
  WHERE c.deck_id = p_deck_id
  ORDER BY c.created_at;

  IF NOT v_forked_before AND v_src.user_id <> v_uid THEN
    UPDATE public.decks SET fork_count = COALESCE(fork_count, 0) + 1 WHERE id = p_deck_id;
  END IF;

  RETURN v_new_deck;
END;
$$;


ALTER FUNCTION "public"."fork_public_deck"("p_deck_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_class_invite_code"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_code TEXT;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.classrooms WHERE invite_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;


ALTER FUNCTION "public"."generate_class_invite_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_quiz_questions"("p_assignment_id" "uuid") RETURNS TABLE("card_id" "uuid", "prompt" "text", "choices" "text"[])
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_a public.assignments := public.classroom_quiz_assignment(p_assignment_id);
BEGIN
  RETURN QUERY
  SELECT q.card_id,
         q.front,
         ARRAY(
           SELECT o.opt FROM (
             SELECT q.back AS opt
             UNION ALL
             (
               SELECT d.back FROM (
                 SELECT DISTINCT c.back
                 FROM public.cards c
                 WHERE c.deck_id = v_a.deck_id
                   AND c.user_id = v_a.created_by
                   AND coalesce(trim(c.back), '') <> ''
                   AND c.back <> q.back
               ) d
               ORDER BY md5(d.back || q.card_id::text)
               LIMIT 3
             )
           ) o
           ORDER BY md5(o.opt || q.card_id::text || 'order')
         )
  FROM public.classroom_quiz_cards(v_a.deck_id, v_a.created_by, auth.uid()) q;
END;
$$;


ALTER FUNCTION "public"."get_quiz_questions"("p_assignment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_enrolled_count"("path_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE learning_paths
  SET enrolled_count = enrolled_count + 1
  WHERE id = path_id;
END;
$$;


ALTER FUNCTION "public"."increment_enrolled_count"("path_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_weekly_xp"("p_user_id" "uuid", "p_group_id" "text", "p_tier" integer, "p_xp_delta" integer, "p_accuracy" numeric) RETURNS TABLE("weekly_xp" integer, "accuracy_rate" real, "group_id" "text", "tier" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."increment_weekly_xp"("p_user_id" "uuid", "p_group_id" "text", "p_tier" integer, "p_xp_delta" integer, "p_accuracy" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("user_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_roles
    WHERE user_id = user_uuid
    AND is_active = true
  );
END;
$$;


ALTER FUNCTION "public"."is_admin"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_class_member"("p_classroom_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF p_classroom_id IS NULL OR auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.classroom_memberships
    WHERE classroom_id = p_classroom_id
      AND user_id = auth.uid()
  );
END;
$$;


ALTER FUNCTION "public"."is_class_member"("p_classroom_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_class_teacher"("p_classroom_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF p_classroom_id IS NULL OR auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.classroom_memberships
    WHERE classroom_id = p_classroom_id
      AND user_id = auth.uid()
      AND role = 'teacher'
  );
END;
$$;


ALTER FUNCTION "public"."is_class_teacher"("p_classroom_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"("user_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_roles
    WHERE user_id = user_uuid
    AND role = 'super_admin'
    AND is_active = true
  );
END;
$$;


ALTER FUNCTION "public"."is_super_admin"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_classroom_with_code"("p_code" "text") RETURNS SETOF "public"."classrooms"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_class_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'join_classroom_with_code: anonymous caller' USING ERRCODE = '42501';
  END IF;
  IF p_code IS NULL OR length(p_code) = 0 THEN
    RAISE EXCEPTION 'join_classroom_with_code: code is required' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_class_id
  FROM public.classrooms WHERE invite_code = upper(trim(p_code));

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'urn:auramind:classroom:not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.classroom_memberships
    WHERE classroom_id = v_class_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'urn:auramind:classroom:already_member' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.classroom_memberships (classroom_id, user_id, role)
  VALUES (v_class_id, v_uid, 'student');

  RETURN QUERY SELECT * FROM public.classrooms WHERE id = v_class_id;
END;
$$;


ALTER FUNCTION "public"."join_classroom_with_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."league_group_roster"("p_group_id" "text", "p_season_id" "text") RETURNS TABLE("user_id" "uuid", "display_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select m.user_id,
         coalesce(
           nullif(split_part(trim(up.full_name), ' ', 1), ''),
           'Learner'
         ) as display_name
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


ALTER FUNCTION "public"."league_group_roster"("p_group_id" "text", "p_season_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."league_memberships_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."league_memberships_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leave_classroom"("p_classroom_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'leave_classroom: anonymous caller' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.classroom_memberships
  WHERE classroom_id = p_classroom_id AND user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.classrooms WHERE id = p_classroom_id AND owner_id = auth.uid());
END;
$$;


ALTER FUNCTION "public"."leave_classroom"("p_classroom_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_admin_users_secure"("p_search_term" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_result JSONB;
  v_search TEXT := COALESCE(NULLIF(TRIM(p_search_term), ''), '');
BEGIN
  IF NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created DESC), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT
      au.id::text                                                    AS id,
      au.email::text                                                 AS email,
      -- Column-tolerant lookup: defer to JSON extraction so a
      -- `user_profiles` table that predates the `role` / `plan`
      -- / `name` columns (older shapes only have `id` + `email`)
      -- doesn't make the WHOLE RPC ERROR. `to_jsonb(...)` is safe
      -- because Postgres can introspect ANY columns.
      COALESCE(
        NULLIF(au.raw_user_meta_data->>'full_name', ''),
        (
          SELECT to_jsonb(up)->>'name'
          FROM public.user_profiles up
          WHERE up.user_id = au.id
          LIMIT 1
        ),
        (
          SELECT to_jsonb(p)->>'full_name'
          FROM public.profiles p
          WHERE p.id = au.id
          LIMIT 1
        ),
        split_part(au.email, '@', 1)
      )                                                             AS name,
      COALESCE(
        (
          SELECT to_jsonb(up)->>'role'
          FROM public.user_profiles up
          WHERE up.user_id = au.id
          LIMIT 1
        ),
        (
          SELECT to_jsonb(p)->>'subscription_tier'
          FROM public.profiles p
          WHERE p.id = au.id
          LIMIT 1
        ),
        'user'
      )                                                             AS role,
      COALESCE(
        (
          SELECT to_jsonb(up)->>'plan'
          FROM public.user_profiles up
          WHERE up.user_id = au.id
          LIMIT 1
        ),
        'free'
      )                                                             AS plan,
      (au.raw_user_meta_data->>'avatar_url')                         AS avatar_url,
      au.email_confirmed_at IS NOT NULL                              AS is_email_verified,
      au.created_at                                                  AS created,
      au.last_sign_in_at                                             AS last_sign_in,
      au.banned_until IS NOT NULL                                    AS is_banned
    FROM auth.users au
    WHERE
      v_search = ''
      OR au.email ILIKE '%' || v_search || '%'
      OR (au.raw_user_meta_data->>'full_name') ILIKE '%' || v_search || '%'
    ORDER BY au.created_at DESC
    LIMIT 200
  ) t;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."list_admin_users_secure"("p_search_term" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_public_decks"("p_search" "text" DEFAULT NULL::"text", "p_category" "text" DEFAULT NULL::"text", "p_sort" "text" DEFAULT 'popular'::"text", "p_limit" integer DEFAULT 30) RETURNS TABLE("id" "uuid", "name" "text", "description" "text", "marketplace_category" "text", "marketplace_tags" "text"[], "fork_count" integer, "published_at" timestamp with time zone, "card_count" bigint, "creator_first_name" "text", "is_mine" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT
    d.id,
    d.name,
    COALESCE(NULLIF(d.marketplace_description, ''), d.description),
    d.marketplace_category,
    COALESCE(d.marketplace_tags, '{}'::text[]),
    COALESCE(d.fork_count, 0),
    d.published_at,
    (SELECT count(*) FROM public.cards c WHERE c.deck_id = d.id),
    NULLIF(split_part(btrim(p.full_name), ' ', 1), ''),
    d.user_id = auth.uid()
  FROM public.decks d
  LEFT JOIN public.user_profiles p ON p.user_id = d.user_id
  WHERE d.is_public = true
    AND auth.uid() IS NOT NULL
    AND (
      NULLIF(btrim(p_search), '') IS NULL
      OR d.name ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(d.marketplace_description, d.description, '') ILIKE '%' || btrim(p_search) || '%'
    )
    AND (NULLIF(p_category, '') IS NULL OR d.marketplace_category = p_category)
  ORDER BY
    CASE WHEN p_sort = 'newest' THEN d.published_at END DESC NULLS LAST,
    COALESCE(d.fork_count, 0) DESC,
    d.published_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
$$;


ALTER FUNCTION "public"."list_public_decks"("p_search" "text", "p_category" "text", "p_sort" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."promote_admin"("target_user" "uuid", "new_role" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  caller uuid := auth.uid();
  existing_role text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT is_super_admin(caller) THEN
    RAISE EXCEPTION 'Only super admins may promote/demote admins';
  END IF;
  IF new_role NOT IN ('admin','super_admin') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  SELECT role INTO existing_role FROM admin_roles WHERE user_id = target_user AND is_active = true LIMIT 1;
  IF existing_role IS NULL THEN
    INSERT INTO admin_roles (user_id, role, is_active) VALUES (target_user, new_role, true);
    RETURN 'created';
  ELSE
    UPDATE admin_roles SET role = new_role, updated_at = now(), is_active = true WHERE user_id = target_user;
    RETURN 'updated';
  END IF;
END;
$$;


ALTER FUNCTION "public"."promote_admin"("target_user" "uuid", "new_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_old_chat_sessions"("p_user_id" "uuid", "p_max_count" integer DEFAULT 250) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'cannot prune another user''s sessions' USING ERRCODE = '42501';
  END IF;

  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY pinned ORDER BY updated_at DESC) AS rn
    FROM ai_chat_sessions
    WHERE user_id = p_user_id
  ),
  stale AS (
    SELECT id FROM ranked WHERE rn > p_max_count
  )
  DELETE FROM ai_chat_sessions
  WHERE id IN (SELECT id FROM stale);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;


ALTER FUNCTION "public"."prune_old_chat_sessions"("p_user_id" "uuid", "p_max_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_processed_webhook_events"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.processed_webhook_events
  where processed_at < now() - interval '90 days';
end;
$$;


ALTER FUNCTION "public"."prune_processed_webhook_events"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_assignment_progress"("p_assignment_id" "uuid", "p_local_deck_id" "uuid" DEFAULT NULL::"uuid", "p_quiz_correct" integer DEFAULT NULL::integer, "p_quiz_total" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_assignment RECORD;
  v_status TEXT;
  v_started TIMESTAMPTZ;
  v_completed TIMESTAMPTZ;
  v_cards_total INTEGER;
  v_cards_reviewed INTEGER;
  v_missed INTEGER;
  v_accuracy REAL;
  v_time_spent_s INTEGER;
  v_score INTEGER;
  v_score_total INTEGER;
  v_details JSONB;
  v_most_missed JSONB;
  v_window TIMESTAMPTZ;
  v_progress_id UUID;
  v_prev_started TIMESTAMPTZ;
  v_prev_status TEXT;
  v_local_deck_id UUID;
  v_card_owner UUID;
BEGIN
  SELECT id, classroom_id, kind, start_at, created_at, deck_id
  INTO v_assignment
  FROM public.assignments WHERE id = p_assignment_id;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'record_assignment_progress: assignment not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_class_member(v_assignment.classroom_id) THEN
    RAISE EXCEPTION 'record_assignment_progress: caller is not a member of this class' USING ERRCODE = '42501';
  END IF;

  SELECT status, started_at INTO v_prev_status, v_prev_started
  FROM public.assignment_progress
  WHERE assignment_id = p_assignment_id AND user_id = v_uid;

  v_window := COALESCE(v_assignment.start_at, v_assignment.created_at);

  IF v_assignment.kind = 'deck' THEN
    v_local_deck_id := COALESCE(p_local_deck_id,
      (SELECT local_deck_id FROM public.assignment_progress
       WHERE assignment_id = p_assignment_id AND user_id = v_uid));
    IF v_local_deck_id IS NULL THEN
      RAISE EXCEPTION 'record_assignment_progress: accept the deck assignment first (no local deck)' USING ERRCODE = '22000';
    END IF;
    SELECT user_id INTO v_card_owner FROM public.decks WHERE id = v_local_deck_id;
    IF v_card_owner IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'record_assignment_progress: local deck must be your own copy' USING ERRCODE = '42501';
    END IF;

    SELECT count(*) INTO v_cards_total
    FROM public.cards WHERE deck_id = v_local_deck_id AND user_id = v_uid;

    SELECT count(DISTINCT cr.card_id),
           count(*) FILTER (WHERE cr.rating = 0)::int
    INTO v_cards_reviewed, v_missed
    FROM public.card_reviews cr
    JOIN public.cards c ON c.id = cr.card_id
    WHERE cr.user_id = v_uid
      AND c.deck_id = v_local_deck_id
      AND c.user_id = v_uid
      AND cr.reviewed_at >= v_window;

    SELECT COALESCE(sum(duration_ms) / 1000, 0)::int INTO v_time_spent_s
    FROM public.study_sessions
    WHERE user_id = v_uid AND deck_id = v_local_deck_id AND started_at >= v_window;

    IF v_cards_reviewed > 0 THEN
      v_accuracy := GREATEST(0, LEAST(100, ((v_cards_reviewed - v_missed)::real / v_cards_reviewed) * 100))::real;
    END IF;

    SELECT jsonb_agg(m) INTO v_most_missed FROM (
      SELECT jsonb_build_object('front', c.front, 'misses', count(*)::int) AS m
      FROM public.card_reviews cr
      JOIN public.cards c ON c.id = cr.card_id
      WHERE cr.user_id = v_uid
        AND c.deck_id = v_local_deck_id
        AND c.user_id = v_uid
        AND cr.rating = 0
        AND cr.reviewed_at >= v_window
      GROUP BY c.front
      ORDER BY count(*) DESC
      LIMIT 5
    ) t;

    IF v_cards_total > 0 AND v_cards_reviewed >= v_cards_total THEN
      v_status := 'completed';
    ELSIF v_cards_reviewed > 0 THEN
      v_status := 'in_progress';
    ELSE
      v_status := 'assigned';
    END IF;

    v_details := jsonb_build_object('most_missed', COALESCE(v_most_missed, '[]'::jsonb));
    v_score := NULL;
    v_score_total := NULL;
  ELSE
    -- Legacy quiz (created before questions existed): self-reported score.
    -- A deck-backed quiz is graded by submit_quiz_attempt, never self-reported.
    IF v_assignment.deck_id IS NOT NULL THEN
      RAISE EXCEPTION 'record_assignment_progress: this quiz is graded by submit_quiz_attempt' USING ERRCODE = '42501';
    END IF;
    IF p_quiz_total IS NULL OR p_quiz_total <= 0 OR p_quiz_correct IS NULL OR p_quiz_correct < 0 OR p_quiz_correct > p_quiz_total THEN
      RAISE EXCEPTION 'record_assignment_progress: invalid quiz score' USING ERRCODE = '22023';
    END IF;
    v_score := p_quiz_correct;
    v_score_total := p_quiz_total;
    v_status := 'completed';
    v_cards_total := NULL;
    v_cards_reviewed := NULL;
    v_missed := NULL;
    v_accuracy := (p_quiz_correct::real / p_quiz_total) * 100;
    v_time_spent_s := NULL;
    v_local_deck_id := NULL;
    v_details := NULL;
  END IF;

  v_started := CASE WHEN v_cards_reviewed IS NULL OR v_cards_reviewed > 0 THEN COALESCE(v_prev_started, NOW()) ELSE v_prev_started END;
  IF v_status = 'completed' THEN
    v_completed := NOW();
  END IF;
  -- Never regress a completed assignment back to in_progress.
  IF v_prev_status = 'completed' THEN
    v_status := 'completed';
    v_completed := COALESCE((SELECT completed_at FROM public.assignment_progress WHERE assignment_id = p_assignment_id AND user_id = v_uid), NOW());
  END IF;

  INSERT INTO public.assignment_progress (
    assignment_id, classroom_id, user_id, local_deck_id, status,
    started_at, completed_at, score, score_total, accuracy,
    cards_total, cards_reviewed, misses, time_spent_s, details
  )
  VALUES (
    p_assignment_id, v_assignment.classroom_id, v_uid, v_local_deck_id, v_status,
    v_started, v_completed, v_score, v_score_total, v_accuracy,
    v_cards_total, v_cards_reviewed, v_missed, v_time_spent_s, v_details
  )
  ON CONFLICT (assignment_id, user_id) DO UPDATE SET
    status        = EXCLUDED.status,
    started_at    = COALESCE(assignment_progress.started_at, EXCLUDED.started_at),
    completed_at  = EXCLUDED.completed_at,
    score         = EXCLUDED.score,
    score_total   = EXCLUDED.score_total,
    accuracy      = EXCLUDED.accuracy,
    cards_total   = EXCLUDED.cards_total,
    cards_reviewed = EXCLUDED.cards_reviewed,
    misses        = EXCLUDED.misses,
    time_spent_s  = EXCLUDED.time_spent_s,
    details       = EXCLUDED.details,
    local_deck_id = COALESCE(EXCLUDED.local_deck_id, assignment_progress.local_deck_id)
  RETURNING id INTO v_progress_id;

  RETURN jsonb_build_object(
    'progress_id', v_progress_id,
    'status', v_status,
    'started_at', v_started,
    'completed_at', v_completed,
    'score', v_score,
    'score_total', v_score_total,
    'accuracy', v_accuracy,
    'cards_total', v_cards_total,
    'cards_reviewed', v_cards_reviewed,
    'misses', v_missed,
    'time_spent_s', v_time_spent_s,
    'most_missed', COALESCE(v_details->'most_missed', '[]'::jsonb)
  );
END;
$$;


ALTER FUNCTION "public"."record_assignment_progress"("p_assignment_id" "uuid", "p_local_deck_id" "uuid", "p_quiz_correct" integer, "p_quiz_total" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_card_review"("p_card_id" "uuid", "p_rating" integer, "p_srs_result" "jsonb", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_srs_algorithm" "text" DEFAULT 'fsrs'::"text", "p_reviewed_at" timestamp with time zone DEFAULT "now"()) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_card_owner UUID;
  v_rating     INTEGER;
  v_user_id    UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  -- ── Reviewer identity ───────────────────────────────────────────────
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'record_card_review: anonymous caller has no auth.uid'
      USING ERRCODE = '42501';
  END IF;

  -- 1. The caller must be writing their own review.
  IF v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'record_card_review: caller is not the rated user'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Rating must be a non-null integer in the FSRS v5 surface range
  --    (0..5), matching the live `card_reviews.rating` CHECK constraint.
  IF p_rating IS NULL THEN
    RAISE EXCEPTION 'record_card_review: rating cannot be NULL'
      USING ERRCODE = '22000';
  END IF;
  IF p_rating < 0 OR p_rating > 5 THEN
    RAISE EXCEPTION 'record_card_review: rating must be an integer 0..5, got %', p_rating
      USING ERRCODE = '22000';
  END IF;
  v_rating := p_rating;

  -- 3. The card must exist AND belong to the reviewing user.
  SELECT user_id INTO v_card_owner
    FROM cards
    WHERE id = p_card_id;
  IF v_card_owner IS NULL THEN
    RAISE EXCEPTION 'record_card_review: card % not found', p_card_id
      USING ERRCODE = 'P0002';
  ELSIF v_card_owner <> v_user_id THEN
    RAISE EXCEPTION 'record_card_review: card does not belong to caller'
      USING ERRCODE = '42501';
  END IF;

  -- ── Write ────────────────────────────────────────────────────────────
  -- One row per review. A retry of the same review carries the same
  -- (user_id, card_id, reviewed_at) triple — the offline queue replays the
  -- ORIGINAL review timestamp — so it conflicts and no-ops instead of
  -- duplicating. Genuinely distinct reviews always differ in reviewed_at.

  INSERT INTO card_reviews (
    user_id, card_id, rating, srs_result, srs_algorithm, reviewed_at, synced_at
  )
  VALUES (
    v_user_id, p_card_id, v_rating, p_srs_result, p_srs_algorithm, p_reviewed_at, NOW()
  )
  ON CONFLICT (user_id, card_id, reviewed_at) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."record_card_review"("p_card_id" "uuid", "p_rating" integer, "p_srs_result" "jsonb", "p_user_id" "uuid", "p_srs_algorithm" "text", "p_reviewed_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_class_invite_code"("p_classroom_id" "uuid") RETURNS SETOF "public"."classrooms"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT public.is_class_teacher(p_classroom_id) THEN
    RAISE EXCEPTION 'refresh_class_invite_code: caller is not a teacher here' USING ERRCODE = '42501';
  END IF;
  UPDATE public.classrooms SET invite_code = public.generate_class_invite_code()
  WHERE id = p_classroom_id;
  RETURN QUERY SELECT * FROM public.classrooms WHERE id = p_classroom_id;
END;
$$;


ALTER FUNCTION "public"."refresh_class_invite_code"("p_classroom_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_classroom_member"("p_classroom_id" "uuid", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT public.is_class_teacher(p_classroom_id) THEN
    RAISE EXCEPTION 'remove_classroom_member: caller is not a teacher here' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'remove_classroom_member: use leave_classroom to leave' USING ERRCODE = '22000';
  END IF;
  -- The owner can never be removed via membership surgery.
  DELETE FROM public.classroom_memberships
  WHERE classroom_id = p_classroom_id
    AND user_id = p_user_id
    AND NOT EXISTS (SELECT 1 FROM public.classrooms WHERE id = p_classroom_id AND owner_id = p_user_id);
END;
$$;


ALTER FUNCTION "public"."remove_classroom_member"("p_classroom_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_class_member_role"("p_classroom_id" "uuid", "p_user_id" "uuid", "p_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'set_class_member_role: anonymous caller' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.classrooms WHERE id = p_classroom_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'set_class_member_role: only the classroom owner manages roles' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('teacher', 'student') THEN
    RAISE EXCEPTION 'set_class_member_role: role must be teacher or student' USING ERRCODE = '22023';
  END IF;
  -- The owner is always a teacher and stays one.
  UPDATE public.classroom_memberships
  SET role = p_role
  WHERE classroom_id = p_classroom_id
    AND user_id = p_user_id
    AND NOT EXISTS (SELECT 1 FROM public.classrooms WHERE id = p_classroom_id AND owner_id = p_user_id);
END;
$$;


ALTER FUNCTION "public"."set_class_member_role"("p_classroom_id" "uuid", "p_user_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_quiz_attempt"("p_assignment_id" "uuid", "p_answers" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_a public.assignments := public.classroom_quiz_assignment(p_assignment_id);
  v_total INTEGER;
  v_correct INTEGER;
  v_missed JSONB;
  v_accuracy REAL;
  v_attempts INTEGER;
  v_progress_id UUID;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'submit_quiz_attempt: answers must be an object' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::int,
         (count(*) FILTER (WHERE p_answers ->> q.card_id::text = q.back))::int,
         coalesce(
           jsonb_agg(jsonb_build_object('front', q.front, 'misses', 1))
             FILTER (WHERE (p_answers ->> q.card_id::text) IS DISTINCT FROM q.back),
           '[]'::jsonb)
  INTO v_total, v_correct, v_missed
  FROM public.classroom_quiz_cards(v_a.deck_id, v_a.created_by, v_uid) q;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'submit_quiz_attempt: quiz has no questions' USING ERRCODE = '22000';
  END IF;
  v_accuracy := (v_correct::real / v_total) * 100;

  SELECT coalesce((details ->> 'attempts')::int, 0) + 1 INTO v_attempts
  FROM public.assignment_progress
  WHERE assignment_id = p_assignment_id AND user_id = v_uid;
  v_attempts := coalesce(v_attempts, 1);

  INSERT INTO public.assignment_progress (
    assignment_id, classroom_id, user_id, status, started_at, completed_at,
    score, score_total, accuracy, details
  )
  VALUES (
    p_assignment_id, v_a.classroom_id, v_uid, 'completed', NOW(), NOW(),
    v_correct, v_total, v_accuracy,
    jsonb_build_object('most_missed', v_missed, 'attempts', v_attempts, 'graded', true)
  )
  -- Retakes are allowed; the teacher sees the best attempt (and how many
  -- attempts there were). completed_at marks when that best was reached.
  ON CONFLICT (assignment_id, user_id) DO UPDATE SET
    status       = 'completed',
    completed_at = CASE WHEN assignment_progress.accuracy IS NULL OR EXCLUDED.accuracy >= assignment_progress.accuracy
                        THEN NOW() ELSE assignment_progress.completed_at END,
    score        = CASE WHEN assignment_progress.accuracy IS NULL OR EXCLUDED.accuracy >= assignment_progress.accuracy
                        THEN EXCLUDED.score ELSE assignment_progress.score END,
    score_total  = CASE WHEN assignment_progress.accuracy IS NULL OR EXCLUDED.accuracy >= assignment_progress.accuracy
                        THEN EXCLUDED.score_total ELSE assignment_progress.score_total END,
    details      = CASE WHEN assignment_progress.accuracy IS NULL OR EXCLUDED.accuracy >= assignment_progress.accuracy
                        THEN EXCLUDED.details
                        ELSE jsonb_set(coalesce(assignment_progress.details, '{}'::jsonb), '{attempts}', to_jsonb(v_attempts)) END,
    accuracy     = GREATEST(coalesce(assignment_progress.accuracy, 0), EXCLUDED.accuracy)
  RETURNING id INTO v_progress_id;

  RETURN jsonb_build_object(
    'progress_id', v_progress_id,
    'score', v_correct,
    'score_total', v_total,
    'accuracy', v_accuracy,
    'attempts', v_attempts,
    'missed', v_missed
  );
END;
$$;


ALTER FUNCTION "public"."submit_quiz_attempt"("p_assignment_id" "uuid", "p_answers" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_auth_role_to_profiles"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := NEW.raw_app_meta_data ->> 'role';
  IF v_role IS NULL THEN
    v_role := 'user';
  END IF;

  INSERT INTO public.user_profiles (id, user_id, role)
  VALUES (NEW.id, NEW.id, v_role)
  ON CONFLICT (user_id)
    DO UPDATE SET role = EXCLUDED.role, id = EXCLUDED.id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_auth_role_to_profiles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_admin_secure"("p_target_uuid" "uuid", "p_make_admin" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_target_email TEXT;
  v_target_meta JSONB;
BEGIN
  IF NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = '42501';
  END IF;

  -- Don't let non-owners demote owners.
  SELECT email, raw_user_meta_data
    INTO v_target_email, v_target_meta
    FROM auth.users
    WHERE id = p_target_uuid;

  IF v_target_email IS NULL THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT p_make_admin AND (v_target_meta->>'role') = 'owner' THEN
    RAISE EXCEPTION 'cannot demote owner' USING ERRCODE = '42501';
  END IF;

  -- Update only the display-only role column that actually exists.
  UPDATE public.user_profiles
     SET role = CASE WHEN p_make_admin THEN 'admin' ELSE 'user' END
   WHERE user_id = p_target_uuid;

  RETURN jsonb_build_object(
    'id', p_target_uuid::text,
    'role', CASE WHEN p_make_admin THEN 'admin' ELSE 'user' END,
    'is_admin', p_make_admin
  );
END;
$$;


ALTER FUNCTION "public"."toggle_admin_secure"("p_target_uuid" "uuid", "p_make_admin" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ai_chat_sessions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ai_chat_sessions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_assignment"("p_assignment_id" "uuid", "p_title" "text" DEFAULT NULL::"text", "p_instructions" "text" DEFAULT NULL::"text", "p_start_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_due_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS SETOF "public"."assignments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_class_id UUID;
  v_start TIMESTAMPTZ;
  v_due TIMESTAMPTZ;
BEGIN
  SELECT classroom_id, start_at, due_at INTO v_class_id, v_start, v_due
  FROM public.assignments WHERE id = p_assignment_id;
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'update_assignment: assignment not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_class_teacher(v_class_id) THEN
    RAISE EXCEPTION 'update_assignment: caller is not a teacher here' USING ERRCODE = '42501';
  END IF;

  v_start := COALESCE(p_start_at, v_start);
  v_due := COALESCE(p_due_at, v_due);
  IF v_due IS NOT NULL AND v_start IS NOT NULL AND v_due <= v_start THEN
    RAISE EXCEPTION 'update_assignment: due_at must be after start_at' USING ERRCODE = '22023';
  END IF;

  UPDATE public.assignments SET
    title = COALESCE(NULLIF(trim(p_title), ''), title),
    instructions = COALESCE(NULLIF(p_instructions, ''), instructions),
    start_at = COALESCE(p_start_at, start_at),
    due_at = COALESCE(p_due_at, due_at)
  WHERE id = p_assignment_id;

  RETURN QUERY SELECT * FROM public.assignments WHERE id = p_assignment_id;
END;
$$;


ALTER FUNCTION "public"."update_assignment"("p_assignment_id" "uuid", "p_title" "text", "p_instructions" "text", "p_start_at" timestamp with time zone, "p_due_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_classroom"("p_classroom_id" "uuid", "p_title" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text", "p_subject" "text" DEFAULT NULL::"text", "p_color" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."classrooms"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT public.is_class_teacher(p_classroom_id) THEN
    RAISE EXCEPTION 'update_classroom: caller is not a teacher in this classroom' USING ERRCODE = '42501';
  END IF;

  UPDATE public.classrooms SET
    title       = COALESCE(NULLIF(trim(p_title), ''), title),
    description = COALESCE(NULLIF(p_description, ''), description),
    subject     = COALESCE(NULLIF(p_subject, ''), subject),
    color       = COALESCE(NULLIF(p_color, ''), color)
  WHERE id = p_classroom_id;

  RETURN QUERY SELECT * FROM public.classrooms WHERE id = p_classroom_id;
END;
$$;


ALTER FUNCTION "public"."update_classroom"("p_classroom_id" "uuid", "p_title" "text", "p_description" "text", "p_subject" "text", "p_color" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_league_memberships_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_league_memberships_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_profiles_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_profiles_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_user_fsrs_params"("p_user_id" "uuid", "p_weights" "jsonb", "p_review_count" integer, "p_accuracy_baseline" numeric, "p_loss_value" numeric, "p_profile_label" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'cannot write another user fsrs params' USING ERRCODE = '42501';
  END IF;

  INSERT INTO user_fsrs_params (
    user_id, weights, review_count, accuracy_baseline, loss_value, profile_label, last_tuned_at, tuning_runs
  )
  VALUES (p_user_id, p_weights, p_review_count, p_accuracy_baseline, p_loss_value, p_profile_label, NOW(), 1)
  ON CONFLICT (user_id) DO UPDATE SET
    weights = EXCLUDED.weights,
    review_count = EXCLUDED.review_count,
    accuracy_baseline = EXCLUDED.accuracy_baseline,
    loss_value = EXCLUDED.loss_value,
    profile_label = EXCLUDED.profile_label,
    last_tuned_at = NOW(),
    tuning_runs = user_fsrs_params.tuning_runs + 1;
END;
$$;


ALTER FUNCTION "public"."upsert_user_fsrs_params"("p_user_id" "uuid", "p_weights" "jsonb", "p_review_count" integer, "p_accuracy_baseline" numeric, "p_loss_value" numeric, "p_profile_label" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_backup_cards_legacy_srs" (
    "id" "uuid" NOT NULL,
    "next_review" timestamp with time zone,
    "interval" integer,
    "repetition" integer,
    "last_reviewed" timestamp with time zone,
    "backed_up_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."_backup_cards_legacy_srs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "target_user_id" "uuid",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "granted_by" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "admin_roles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))
);


ALTER TABLE "public"."admin_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_chat_sessions" (
    "id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'New chat'::"text" NOT NULL,
    "mode" "text" DEFAULT 'free'::"text" NOT NULL,
    "deck_id" "uuid",
    "deck_name" "text",
    "pinned" boolean DEFAULT false NOT NULL,
    "messages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_chat_sessions_mode_check" CHECK (("mode" = ANY (ARRAY['explain'::"text", 'quiz'::"text", 'generate'::"text", 'free'::"text", 'study'::"text", 'companion'::"text"])))
);


ALTER TABLE "public"."ai_chat_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_generation_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "deck_id" "uuid",
    "prompt" "text" NOT NULL,
    "front" "text" NOT NULL,
    "back" "text" NOT NULL,
    "difficulty" "text" DEFAULT 'medium'::"text",
    "taxonomy" "text" DEFAULT 'understand'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ai_generation_logs_difficulty_check" CHECK (("difficulty" = ANY (ARRAY['easy'::"text", 'medium'::"text", 'hard'::"text"]))),
    CONSTRAINT "ai_generation_logs_taxonomy_check" CHECK (("taxonomy" = ANY (ARRAY['remember'::"text", 'understand'::"text", 'apply'::"text", 'analyze'::"text", 'evaluate'::"text", 'create'::"text"])))
);


ALTER TABLE "public"."ai_generation_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_generation_usage" (
    "user_id" "uuid" NOT NULL,
    "usage_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."ai_generation_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."analytics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignment_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "classroom_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "local_deck_id" "uuid",
    "status" "text" DEFAULT 'assigned'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "score" integer,
    "score_total" integer,
    "accuracy" real,
    "cards_total" integer,
    "cards_reviewed" integer,
    "misses" integer,
    "time_spent_s" integer,
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "assignment_progress_accuracy_check" CHECK ((("accuracy" IS NULL) OR (("accuracy" >= (0)::double precision) AND ("accuracy" <= (100)::double precision)))),
    CONSTRAINT "assignment_progress_status_check" CHECK (("status" = ANY (ARRAY['assigned'::"text", 'in_progress'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."assignment_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "actor_email" "text" NOT NULL,
    "action" "text" NOT NULL,
    "category" "text" NOT NULL,
    "target_id" "text",
    "target_email" "text",
    "details" "text",
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "audit_events_category_check" CHECK (("category" = ANY (ARRAY['user'::"text", 'subscription'::"text", 'admin'::"text", 'database'::"text", 'system'::"text", 'security'::"text"]))),
    CONSTRAINT "audit_events_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."audit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deck_id" "uuid" NOT NULL,
    "front" "text" NOT NULL,
    "back" "text" NOT NULL,
    "next_review_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "interval_days" integer DEFAULT 1 NOT NULL,
    "ease_factor" real DEFAULT 2.5 NOT NULL,
    "repetitions" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "custom_interval_minutes" integer,
    "user_id" "uuid",
    "fsrs_state" "jsonb",
    "verified" boolean DEFAULT false,
    "source_type" "text",
    "trust_score" numeric DEFAULT 0,
    "lapses" integer DEFAULT 0 NOT NULL,
    "next_review" timestamp with time zone,
    "interval" integer DEFAULT 0,
    "repetition" integer DEFAULT 0,
    "last_reviewed" timestamp with time zone,
    CONSTRAINT "cards_lapses_check" CHECK (("lapses" >= 0))
);


ALTER TABLE "public"."cards" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."card_analytics" WITH ("security_invoker"='on') AS
 SELECT "id",
    "deck_id",
    "user_id",
    "front" AS "question",
    "back" AS "answer",
    "interval",
    "ease_factor",
    "repetition",
    "last_reviewed",
    "verified",
    "fsrs_state",
    "source_type",
    "trust_score",
        CASE
            WHEN ("fsrs_state" IS NOT NULL) THEN 'fsrs'::"text"
            ELSE 'sm2'::"text"
        END AS "srs_algorithm",
        CASE
            WHEN ("repetition" = 0) THEN 'new'::"text"
            WHEN ("interval" <= 21) THEN 'learning'::"text"
            ELSE 'mature'::"text"
        END AS "card_stage",
        CASE
            WHEN ("next_review" IS NULL) THEN 'not_due'::"text"
            WHEN ("next_review" <= "now"()) THEN 'due'::"text"
            WHEN ("next_review" <= ("now"() + '7 days'::interval)) THEN 'due_soon'::"text"
            ELSE 'not_due'::"text"
        END AS "review_status"
   FROM "public"."cards" "c";


ALTER VIEW "public"."card_analytics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."card_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "card_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "srs_result" "jsonb" NOT NULL,
    "srs_algorithm" "text" DEFAULT 'fsrs'::"text" NOT NULL,
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "card_reviews_rating_check" CHECK ((("rating" >= 0) AND ("rating" <= 5)))
);


ALTER TABLE "public"."card_reviews" OWNER TO "postgres";


COMMENT ON CONSTRAINT "card_reviews_rating_check" ON "public"."card_reviews" IS 'Relaxed from 0..4 to 0..5 in 20260724000000 so FSRS v5 Rating.EASY (=5) writes succeed. Upper bound still capped to defend against accidental numeric-as-rating writes. Idempotent on re-apply.';



CREATE TABLE IF NOT EXISTS "public"."card_reviews_backfill_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "card_reviews_id" "uuid" NOT NULL,
    "original_rating" integer NOT NULL,
    "clamped_rating" integer NOT NULL,
    "backfilled_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."card_reviews_backfill_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chat_history_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."chat_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "messages" "jsonb",
    "response_preview" "text",
    "tokens_generated" integer DEFAULT 0,
    "model" "text",
    "duration_ms" integer DEFAULT 0,
    "success" boolean DEFAULT true,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classroom_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "classroom_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "classroom_memberships_role_check" CHECK (("role" = ANY (ARRAY['teacher'::"text", 'student'::"text"])))
);


ALTER TABLE "public"."classroom_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_errors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "path" "text",
    "message" "text" NOT NULL,
    "stack" "text",
    "component_stack" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."client_errors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."debug_email_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "type" "text",
    "email" "text",
    "body" "jsonb",
    "success" boolean,
    "error" "text"
);


ALTER TABLE "public"."debug_email_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."decks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "card_style_overrides" "jsonb",
    "image_url" "text",
    "is_public" boolean DEFAULT false,
    "fork_count" integer DEFAULT 0,
    "original_deck_id" "uuid",
    "marketplace_category" "text",
    "marketplace_tags" "text"[] DEFAULT '{}'::"text"[],
    "marketplace_description" "text",
    "published_at" timestamp with time zone
);


ALTER TABLE "public"."decks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_preferences" (
    "user_id" "uuid" NOT NULL,
    "study_reminders_enabled" boolean DEFAULT true,
    "weekly_reports_enabled" boolean DEFAULT true,
    "deck_sharing_notifications_enabled" boolean DEFAULT true,
    "reminder_time" time without time zone DEFAULT '09:00:00'::time without time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."email_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_check_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "card_id" "uuid",
    "verified" boolean NOT NULL,
    "confidence" numeric DEFAULT 0,
    "issues" "jsonb",
    "suggestions" "jsonb",
    "sources" "jsonb",
    "checked_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."fact_check_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."league_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "season_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "league_group_id" "text" NOT NULL,
    "tier" integer NOT NULL,
    "weekly_xp" integer DEFAULT 0 NOT NULL,
    "accuracy_rate" real DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "league_memberships_accuracy_rate_check" CHECK ((("accuracy_rate" >= (0)::double precision) AND ("accuracy_rate" <= (100)::double precision))),
    CONSTRAINT "league_memberships_tier_check" CHECK ((("tier" >= 1) AND ("tier" <= 10))),
    CONSTRAINT "league_memberships_weekly_xp_check" CHECK (("weekly_xp" >= 0))
);


ALTER TABLE "public"."league_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."league_seasons" (
    "id" "text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    CONSTRAINT "league_seasons_check" CHECK (("ends_at" > "starts_at"))
);


ALTER TABLE "public"."league_seasons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_path_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "learning_path_id" "uuid" NOT NULL,
    "progress" integer DEFAULT 0 NOT NULL,
    "enrolled_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "learning_path_enrollments_progress_check" CHECK ((("progress" >= 0) AND ("progress" <= 100)))
);


ALTER TABLE "public"."learning_path_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_paths" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "icon" "text" DEFAULT 'book'::"text" NOT NULL,
    "level" "text" NOT NULL,
    "duration" "text" NOT NULL,
    "modules" integer DEFAULT 0 NOT NULL,
    "enrolled_count" integer DEFAULT 0 NOT NULL,
    "rating" numeric(3,2) DEFAULT 0.00 NOT NULL,
    "color" "text" DEFAULT 'from-blue-500 to-cyan-500'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "learning_paths_level_check" CHECK (("level" = ANY (ARRAY['beginner'::"text", 'intermediate'::"text", 'advanced'::"text"]))),
    CONSTRAINT "learning_paths_rating_check" CHECK ((("rating" >= (0)::numeric) AND ("rating" <= (5)::numeric)))
);


ALTER TABLE "public"."learning_paths" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."login_email_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."login_email_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."password_reset_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '01:00:00'::interval) NOT NULL,
    "used" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."password_reset_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."performance_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "path" "text" NOT NULL,
    "lcp_ms" integer,
    "cls" numeric,
    "fid_ms" integer,
    "recorded_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."performance_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."processed_webhook_events" (
    "event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."processed_webhook_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."processed_webhook_events" IS 'Stripe webhook idempotency ledger — event IDs already processed by api/stripe-webhook.ts';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "study_preferences" "jsonb" DEFAULT '{}'::"jsonb",
    "custom_theme" "jsonb" DEFAULT '{}'::"jsonb",
    "avatar_url" "text",
    "stripe_customer_id" "text",
    "trial_start" timestamp with time zone,
    "trial_end" timestamp with time zone,
    "subscription_status" "text",
    "subscription_tier" "text",
    "subscription_renews_at" timestamp with time zone,
    "lifetime_xp" integer DEFAULT 0,
    "onboarding_state" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "profiles_subscription_status_check" CHECK (("subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text", 'past_due'::"text", 'canceled'::"text", 'incomplete'::"text", 'incomplete_expired'::"text"]))),
    CONSTRAINT "profiles_subscription_tier_check" CHECK (("subscription_tier" = ANY (ARRAY['free'::"text", 'pro'::"text", 'pro_plus'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" DEFAULT 'android'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schema_migrations" (
    "version" "text" NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"(),
    "description" "text",
    "sha256" "text",
    "file_size_bytes" integer,
    "applied_by" "text" DEFAULT 'run-migrations.js'::"text"
);


ALTER TABLE "public"."schema_migrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shared_decks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deck_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "shared_with_email" "text" NOT NULL,
    "accepted" boolean DEFAULT false,
    "accepted_by" "uuid",
    "share_token" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shared_decks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_customers" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "customer_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."stripe_customers" OWNER TO "postgres";


ALTER TABLE "public"."stripe_customers" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."stripe_customers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."stripe_orders" (
    "id" bigint NOT NULL,
    "checkout_session_id" "text" NOT NULL,
    "payment_intent_id" "text" NOT NULL,
    "customer_id" "text" NOT NULL,
    "amount_subtotal" bigint NOT NULL,
    "amount_total" bigint NOT NULL,
    "currency" "text" NOT NULL,
    "payment_status" "text" NOT NULL,
    "status" "public"."stripe_order_status" DEFAULT 'pending'::"public"."stripe_order_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."stripe_orders" OWNER TO "postgres";


ALTER TABLE "public"."stripe_orders" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."stripe_orders_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."stripe_subscriptions" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "subscription_id" "text",
    "price_id" "text",
    "current_period_start" bigint,
    "current_period_end" bigint,
    "cancel_at_period_end" boolean DEFAULT false,
    "payment_method_brand" "text",
    "payment_method_last4" "text",
    "status" "public"."stripe_subscription_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."stripe_subscriptions" OWNER TO "postgres";


ALTER TABLE "public"."stripe_subscriptions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."stripe_subscriptions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."stripe_user_orders" WITH ("security_invoker"='true') AS
 SELECT "c"."customer_id",
    "o"."id" AS "order_id",
    "o"."checkout_session_id",
    "o"."payment_intent_id",
    "o"."amount_subtotal",
    "o"."amount_total",
    "o"."currency",
    "o"."payment_status",
    "o"."status" AS "order_status",
    "o"."created_at" AS "order_date"
   FROM ("public"."stripe_customers" "c"
     LEFT JOIN "public"."stripe_orders" "o" ON (("c"."customer_id" = "o"."customer_id")))
  WHERE (("c"."user_id" = "auth"."uid"()) AND ("c"."deleted_at" IS NULL) AND ("o"."deleted_at" IS NULL));


ALTER VIEW "public"."stripe_user_orders" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."stripe_user_subscriptions" WITH ("security_invoker"='true') AS
 SELECT "c"."customer_id",
    "s"."subscription_id",
    "s"."status" AS "subscription_status",
    "s"."price_id",
    "s"."current_period_start",
    "s"."current_period_end",
    "s"."cancel_at_period_end",
    "s"."payment_method_brand",
    "s"."payment_method_last4"
   FROM ("public"."stripe_customers" "c"
     LEFT JOIN "public"."stripe_subscriptions" "s" ON (("c"."customer_id" = "s"."customer_id")))
  WHERE (("c"."user_id" = "auth"."uid"()) AND ("c"."deleted_at" IS NULL) AND ("s"."deleted_at" IS NULL));


ALTER VIEW "public"."stripe_user_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "deck_id" "uuid",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "ended_at" timestamp with time zone,
    "cards_reviewed" integer DEFAULT 0,
    "cards_correct" integer DEFAULT 0,
    "cards_studied" integer,
    "correct_answers" integer,
    "total_answers" integer,
    "accuracy" integer,
    "duration_ms" bigint,
    CONSTRAINT "study_sessions_accuracy_check" CHECK ((("accuracy" IS NULL) OR (("accuracy" >= 0) AND ("accuracy" <= 100))))
);


ALTER TABLE "public"."study_sessions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."study_sessions"."cards_studied" IS 'Total cards answered in this session (may differ from cards_reviewed which tracks ever-seen)';



COMMENT ON COLUMN "public"."study_sessions"."correct_answers" IS 'Count of ratings >= "Good" treated as correct';



COMMENT ON COLUMN "public"."study_sessions"."total_answers" IS 'Same as cards_studied today, kept distinct for future partial-completion sessions';



COMMENT ON COLUMN "public"."study_sessions"."accuracy" IS 'Integer 0-100 percentage of correct_answers / total_answers';



COMMENT ON COLUMN "public"."study_sessions"."duration_ms" IS 'Session duration in milliseconds (started_at → ended_at)';



CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "status" "text" DEFAULT 'trialing'::"text" NOT NULL,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "trial_end" timestamp with time zone DEFAULT ("now"() + '48:00:00'::interval),
    "cancel_at_period_end" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_fsrs_params" (
    "user_id" "uuid" NOT NULL,
    "weights" "jsonb" NOT NULL,
    "review_count" integer DEFAULT 0 NOT NULL,
    "accuracy_baseline" numeric DEFAULT 0 NOT NULL,
    "loss_value" numeric DEFAULT 0 NOT NULL,
    "profile_label" "text",
    "last_tuned_at" timestamp with time zone DEFAULT "now"(),
    "tuning_runs" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."user_fsrs_params" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text",
    "theme_preference" "text" DEFAULT 'dark'::"text",
    "plan_tier" "text" DEFAULT 'free'::"text",
    "streak" integer DEFAULT 0,
    "last_active" timestamp with time zone DEFAULT "now"(),
    "study_preferences" "jsonb" DEFAULT '{"reviewsPerDay": 200, "newCardsPerDay": 20, "maximumInterval": 36500, "requestRetention": 0.9}'::"jsonb",
    "user_id" "uuid",
    "email" "text",
    "xp" integer DEFAULT 0 NOT NULL,
    "level" integer DEFAULT 1 NOT NULL,
    "streak_days" integer DEFAULT 0 NOT NULL,
    "cards_studied" integer DEFAULT 0 NOT NULL,
    "decks_created" integer DEFAULT 0 NOT NULL,
    "sessions_completed" integer DEFAULT 0 NOT NULL,
    "title" "text",
    "last_study_date" timestamp with time zone,
    "role" "text" DEFAULT 'user'::"text"
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."welcome_email_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "message_id" "text",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "welcome_email_events_kind_check" CHECK (("kind" = ANY (ARRAY['signup'::"text", 'subscription'::"text"])))
);


ALTER TABLE "public"."welcome_email_events" OWNER TO "postgres";


ALTER TABLE ONLY "public"."_backup_cards_legacy_srs"
    ADD CONSTRAINT "_backup_cards_legacy_srs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_activity_log"
    ADD CONSTRAINT "admin_activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."ai_chat_sessions"
    ADD CONSTRAINT "ai_chat_sessions_id_unique_per_user" UNIQUE ("id", "user_id");



ALTER TABLE ONLY "public"."ai_chat_sessions"
    ADD CONSTRAINT "ai_chat_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_generation_logs"
    ADD CONSTRAINT "ai_generation_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_generation_usage"
    ADD CONSTRAINT "ai_generation_usage_pkey" PRIMARY KEY ("user_id", "usage_date");



ALTER TABLE ONLY "public"."analytics"
    ADD CONSTRAINT "analytics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignment_progress"
    ADD CONSTRAINT "assignment_progress_assignment_id_user_id_key" UNIQUE ("assignment_id", "user_id");



ALTER TABLE ONLY "public"."assignment_progress"
    ADD CONSTRAINT "assignment_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_events"
    ADD CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."card_reviews_backfill_audit"
    ADD CONSTRAINT "card_reviews_backfill_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."card_reviews"
    ADD CONSTRAINT "card_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cards"
    ADD CONSTRAINT "cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_history"
    ADD CONSTRAINT "chat_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_logs"
    ADD CONSTRAINT "chat_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classroom_memberships"
    ADD CONSTRAINT "classroom_memberships_classroom_id_user_id_key" UNIQUE ("classroom_id", "user_id");



ALTER TABLE ONLY "public"."classroom_memberships"
    ADD CONSTRAINT "classroom_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classrooms"
    ADD CONSTRAINT "classrooms_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."classrooms"
    ADD CONSTRAINT "classrooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_errors"
    ADD CONSTRAINT "client_errors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."debug_email_logs"
    ADD CONSTRAINT "debug_email_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."decks"
    ADD CONSTRAINT "decks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_preferences"
    ADD CONSTRAINT "email_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."fact_check_history"
    ADD CONSTRAINT "fact_check_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."league_memberships"
    ADD CONSTRAINT "league_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."league_memberships"
    ADD CONSTRAINT "league_memberships_season_id_user_id_key" UNIQUE ("season_id", "user_id");



ALTER TABLE ONLY "public"."league_seasons"
    ADD CONSTRAINT "league_seasons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_path_enrollments"
    ADD CONSTRAINT "learning_path_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_path_enrollments"
    ADD CONSTRAINT "learning_path_enrollments_user_id_learning_path_id_key" UNIQUE ("user_id", "learning_path_id");



ALTER TABLE ONLY "public"."learning_paths"
    ADD CONSTRAINT "learning_paths_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."login_email_events"
    ADD CONSTRAINT "login_email_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."performance_metrics"
    ADD CONSTRAINT "performance_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."processed_webhook_events"
    ADD CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."schema_migrations"
    ADD CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("version");



ALTER TABLE ONLY "public"."shared_decks"
    ADD CONSTRAINT "shared_decks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shared_decks"
    ADD CONSTRAINT "shared_decks_share_token_key" UNIQUE ("share_token");



ALTER TABLE ONLY "public"."stripe_customers"
    ADD CONSTRAINT "stripe_customers_customer_id_key" UNIQUE ("customer_id");



ALTER TABLE ONLY "public"."stripe_customers"
    ADD CONSTRAINT "stripe_customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_customers"
    ADD CONSTRAINT "stripe_customers_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."stripe_orders"
    ADD CONSTRAINT "stripe_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_subscriptions"
    ADD CONSTRAINT "stripe_subscriptions_customer_id_key" UNIQUE ("customer_id");



ALTER TABLE ONLY "public"."stripe_subscriptions"
    ADD CONSTRAINT "stripe_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."study_sessions"
    ADD CONSTRAINT "study_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_fsrs_params"
    ADD CONSTRAINT "user_fsrs_params_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_unique" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."welcome_email_events"
    ADD CONSTRAINT "welcome_email_events_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "card_reviews_user_card_reviewed_ux" ON "public"."card_reviews" USING "btree" ("user_id", "card_id", "reviewed_at");



CREATE INDEX "idx_admin_activity_log_admin_id" ON "public"."admin_activity_log" USING "btree" ("admin_id");



CREATE INDEX "idx_admin_activity_log_created_at" ON "public"."admin_activity_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_admin_activity_log_target_user_id" ON "public"."admin_activity_log" USING "btree" ("target_user_id");



CREATE INDEX "idx_admin_roles_is_active" ON "public"."admin_roles" USING "btree" ("is_active");



CREATE INDEX "idx_admin_roles_user_id" ON "public"."admin_roles" USING "btree" ("user_id");



CREATE INDEX "idx_ai_chat_sessions_user_pinned" ON "public"."ai_chat_sessions" USING "btree" ("user_id", "pinned", "updated_at" DESC);



CREATE INDEX "idx_ai_chat_sessions_user_updated" ON "public"."ai_chat_sessions" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "idx_ai_generation_logs_user_created" ON "public"."ai_generation_logs" USING "btree" ("user_id", "created_at");



CREATE INDEX "idx_assignment_progress_assignment" ON "public"."assignment_progress" USING "btree" ("assignment_id");



CREATE INDEX "idx_assignment_progress_user" ON "public"."assignment_progress" USING "btree" ("user_id");



CREATE INDEX "idx_assignments_class_created" ON "public"."assignments" USING "btree" ("classroom_id", "created_at" DESC);



CREATE INDEX "idx_audit_events_actor_id" ON "public"."audit_events" USING "btree" ("actor_id");



CREATE INDEX "idx_audit_events_category" ON "public"."audit_events" USING "btree" ("category");



CREATE INDEX "idx_audit_events_category_created" ON "public"."audit_events" USING "btree" ("category", "created_at" DESC);



CREATE INDEX "idx_audit_events_created_at" ON "public"."audit_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_events_severity" ON "public"."audit_events" USING "btree" ("severity");



CREATE INDEX "idx_card_reviews_backfill_audit_card_id" ON "public"."card_reviews_backfill_audit" USING "btree" ("card_reviews_id");



CREATE INDEX "idx_card_reviews_card_id" ON "public"."card_reviews" USING "btree" ("card_id");



CREATE INDEX "idx_card_reviews_user_id" ON "public"."card_reviews" USING "btree" ("user_id", "reviewed_at" DESC);



CREATE INDEX "idx_cards_deck_id" ON "public"."cards" USING "btree" ("deck_id");



CREATE INDEX "idx_cards_fsrs_state" ON "public"."cards" USING "gin" ("fsrs_state");



CREATE INDEX "idx_cards_user_id" ON "public"."cards" USING "btree" ("user_id");



CREATE INDEX "idx_cards_user_lapses" ON "public"."cards" USING "btree" ("user_id", "lapses") WHERE ("lapses" > 0);



CREATE INDEX "idx_cards_verified" ON "public"."cards" USING "btree" ("verified");



CREATE INDEX "idx_chat_logs_created" ON "public"."chat_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_chat_logs_user" ON "public"."chat_logs" USING "btree" ("user_id");



CREATE INDEX "idx_classroom_memberships_class" ON "public"."classroom_memberships" USING "btree" ("classroom_id");



CREATE INDEX "idx_classroom_memberships_user" ON "public"."classroom_memberships" USING "btree" ("user_id");



CREATE INDEX "idx_client_errors_created_at" ON "public"."client_errors" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_client_errors_user_id" ON "public"."client_errors" USING "btree" ("user_id");



CREATE INDEX "idx_decks_forked_from" ON "public"."decks" USING "btree" ("original_deck_id");



CREATE INDEX "idx_decks_public_browse" ON "public"."decks" USING "btree" ("is_public", "marketplace_category") WHERE ("is_public" = true);



CREATE INDEX "idx_decks_user_id" ON "public"."decks" USING "btree" ("user_id");



CREATE INDEX "idx_fact_check_card" ON "public"."fact_check_history" USING "btree" ("card_id");



CREATE INDEX "idx_fact_check_user" ON "public"."fact_check_history" USING "btree" ("user_id");



CREATE INDEX "idx_league_group_leaderboard" ON "public"."league_memberships" USING "btree" ("season_id", "league_group_id", "weekly_xp" DESC);



CREATE INDEX "idx_league_memberships_season_tier" ON "public"."league_memberships" USING "btree" ("season_id", "tier");



CREATE INDEX "idx_league_memberships_user" ON "public"."league_memberships" USING "btree" ("user_id");



CREATE INDEX "idx_league_seasons_starts_at" ON "public"."league_seasons" USING "btree" ("starts_at" DESC);



CREATE INDEX "idx_league_user_lookup" ON "public"."league_memberships" USING "btree" ("user_id", "season_id" DESC);



CREATE INDEX "idx_learning_path_enrollments_learning_path_id" ON "public"."learning_path_enrollments" USING "btree" ("learning_path_id");



CREATE INDEX "idx_learning_path_enrollments_user_id" ON "public"."learning_path_enrollments" USING "btree" ("user_id");



CREATE INDEX "idx_learning_paths_created_at" ON "public"."learning_paths" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_learning_paths_level" ON "public"."learning_paths" USING "btree" ("level");



CREATE INDEX "idx_login_email_events_user_sent" ON "public"."login_email_events" USING "btree" ("user_id", "sent_at");



CREATE INDEX "idx_password_reset_tokens_expires_at" ON "public"."password_reset_tokens" USING "btree" ("expires_at");



CREATE INDEX "idx_password_reset_tokens_token" ON "public"."password_reset_tokens" USING "btree" ("token");



CREATE INDEX "idx_password_reset_tokens_user_id" ON "public"."password_reset_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_perf_metrics_recorded_at" ON "public"."performance_metrics" USING "btree" ("recorded_at" DESC);



CREATE INDEX "idx_perf_metrics_user_path" ON "public"."performance_metrics" USING "btree" ("user_id", "path");



CREATE UNIQUE INDEX "idx_profiles_stripe_customer" ON "public"."profiles" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE INDEX "idx_profiles_subscription_status" ON "public"."profiles" USING "btree" ("subscription_status") WHERE ("subscription_status" IS NOT NULL);



CREATE INDEX "idx_profiles_trial_end" ON "public"."profiles" USING "btree" ("trial_end") WHERE ("trial_end" IS NOT NULL);



CREATE INDEX "idx_shared_decks_deck_id" ON "public"."shared_decks" USING "btree" ("deck_id");



CREATE INDEX "idx_shared_decks_owner_id" ON "public"."shared_decks" USING "btree" ("owner_id");



CREATE INDEX "idx_shared_decks_share_token" ON "public"."shared_decks" USING "btree" ("share_token");



CREATE INDEX "idx_shared_decks_shared_with_email" ON "public"."shared_decks" USING "btree" ("shared_with_email");



CREATE INDEX "idx_study_sessions_deck" ON "public"."study_sessions" USING "btree" ("deck_id");



CREATE INDEX "idx_study_sessions_no_deck" ON "public"."study_sessions" USING "btree" ("user_id", "started_at" DESC) WHERE ("deck_id" IS NULL);



CREATE INDEX "idx_study_sessions_started" ON "public"."study_sessions" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_study_sessions_user" ON "public"."study_sessions" USING "btree" ("user_id");



CREATE INDEX "idx_subscriptions_user_id" ON "public"."subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_user_profiles_user" ON "public"."user_profiles" USING "btree" ("user_id");



CREATE INDEX "push_tokens_user_id_idx" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE UNIQUE INDEX "welcome_email_events_user_kind_idx" ON "public"."welcome_email_events" USING "btree" ("user_id", "kind");



CREATE OR REPLACE TRIGGER "trg_ai_chat_sessions_updated_at" BEFORE UPDATE ON "public"."ai_chat_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_ai_chat_sessions_updated_at"();



CREATE OR REPLACE TRIGGER "trg_assignment_progress_touch_updated_at" BEFORE UPDATE ON "public"."assignment_progress" FOR EACH ROW EXECUTE FUNCTION "public"."classroom_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_assignments_touch_updated_at" BEFORE UPDATE ON "public"."assignments" FOR EACH ROW EXECUTE FUNCTION "public"."classroom_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_classrooms_touch_updated_at" BEFORE UPDATE ON "public"."classrooms" FOR EACH ROW EXECUTE FUNCTION "public"."classroom_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_league_memberships_touch_updated_at" BEFORE UPDATE ON "public"."league_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."league_memberships_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_league_memberships_updated_at" BEFORE UPDATE ON "public"."league_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."update_league_memberships_updated_at"();



CREATE OR REPLACE TRIGGER "trg_league_xp_notify" AFTER UPDATE OF "weekly_xp" ON "public"."league_memberships" FOR EACH ROW WHEN (("new"."weekly_xp" IS DISTINCT FROM "old"."weekly_xp")) EXECUTE FUNCTION "public"."broadcast_user_notification"();



CREATE OR REPLACE TRIGGER "trg_profile_streak_notify" AFTER UPDATE OF "streak" ON "public"."user_profiles" FOR EACH ROW WHEN (("new"."streak" IS DISTINCT FROM "old"."streak")) EXECUTE FUNCTION "public"."broadcast_user_notification"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_profiles_updated_at"();



CREATE OR REPLACE TRIGGER "trg_study_session_notify" AFTER INSERT ON "public"."study_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_user_notification"();



CREATE OR REPLACE TRIGGER "update_admin_roles_updated_at" BEFORE UPDATE ON "public"."admin_roles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_cards_updated_at" BEFORE UPDATE ON "public"."cards" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_decks_updated_at" BEFORE UPDATE ON "public"."decks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_learning_path_enrollments_updated_at" BEFORE UPDATE ON "public"."learning_path_enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_learning_paths_updated_at" BEFORE UPDATE ON "public"."learning_paths" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."admin_activity_log"
    ADD CONSTRAINT "admin_activity_log_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_activity_log"
    ADD CONSTRAINT "admin_activity_log_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_chat_sessions"
    ADD CONSTRAINT "ai_chat_sessions_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_chat_sessions"
    ADD CONSTRAINT "ai_chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_generation_logs"
    ADD CONSTRAINT "ai_generation_logs_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_generation_logs"
    ADD CONSTRAINT "ai_generation_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_generation_usage"
    ADD CONSTRAINT "ai_generation_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics"
    ADD CONSTRAINT "analytics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."assignment_progress"
    ADD CONSTRAINT "assignment_progress_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_progress"
    ADD CONSTRAINT "assignment_progress_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_progress"
    ADD CONSTRAINT "assignment_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_events"
    ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."card_reviews_backfill_audit"
    ADD CONSTRAINT "card_reviews_backfill_audit_card_reviews_id_fkey" FOREIGN KEY ("card_reviews_id") REFERENCES "public"."card_reviews"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."card_reviews"
    ADD CONSTRAINT "card_reviews_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."card_reviews"
    ADD CONSTRAINT "card_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cards"
    ADD CONSTRAINT "cards_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cards"
    ADD CONSTRAINT "cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_history"
    ADD CONSTRAINT "chat_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."chat_logs"
    ADD CONSTRAINT "chat_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classroom_memberships"
    ADD CONSTRAINT "classroom_memberships_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classroom_memberships"
    ADD CONSTRAINT "classroom_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classrooms"
    ADD CONSTRAINT "classrooms_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_errors"
    ADD CONSTRAINT "client_errors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."decks"
    ADD CONSTRAINT "decks_original_deck_id_fkey" FOREIGN KEY ("original_deck_id") REFERENCES "public"."decks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."decks"
    ADD CONSTRAINT "decks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_preferences"
    ADD CONSTRAINT "email_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fact_check_history"
    ADD CONSTRAINT "fact_check_history_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fact_check_history"
    ADD CONSTRAINT "fact_check_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."league_memberships"
    ADD CONSTRAINT "league_memberships_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."league_seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."league_memberships"
    ADD CONSTRAINT "league_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_path_enrollments"
    ADD CONSTRAINT "learning_path_enrollments_learning_path_id_fkey" FOREIGN KEY ("learning_path_id") REFERENCES "public"."learning_paths"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_path_enrollments"
    ADD CONSTRAINT "learning_path_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."login_email_events"
    ADD CONSTRAINT "login_email_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_metrics"
    ADD CONSTRAINT "performance_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shared_decks"
    ADD CONSTRAINT "shared_decks_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shared_decks"
    ADD CONSTRAINT "shared_decks_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shared_decks"
    ADD CONSTRAINT "shared_decks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stripe_customers"
    ADD CONSTRAINT "stripe_customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."study_sessions"
    ADD CONSTRAINT "study_sessions_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_sessions"
    ADD CONSTRAINT "study_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_fsrs_params"
    ADD CONSTRAINT "user_fsrs_params_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."welcome_email_events"
    ADD CONSTRAINT "welcome_email_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admin can read ai logs" ON "public"."ai_generation_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_roles" "ar"
  WHERE (("ar"."user_id" = "auth"."uid"()) AND ("ar"."is_active" = true)))));



CREATE POLICY "Admin can read usage" ON "public"."ai_generation_usage" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_roles" "ar"
  WHERE (("ar"."user_id" = "auth"."uid"()) AND ("ar"."is_active" = true)))));



CREATE POLICY "Admins can insert activity logs" ON "public"."admin_activity_log" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"("auth"."uid"()) AND ("admin_id" = "auth"."uid"())));



CREATE POLICY "Admins can read audit events" ON "public"."audit_events" FOR SELECT TO "authenticated" USING ("public"."current_user_is_admin"());



CREATE POLICY "Admins can view own activity logs" ON "public"."admin_activity_log" FOR SELECT TO "authenticated" USING (("public"."is_admin"("auth"."uid"()) AND (("admin_id" = "auth"."uid"()) OR "public"."is_super_admin"("auth"."uid"()))));



CREATE POLICY "Admins view login notifications" ON "public"."login_email_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_roles" "ar"
  WHERE (("ar"."user_id" = "auth"."uid"()) AND ("ar"."is_active" = true)))));



CREATE POLICY "Anyone can insert subscription" ON "public"."subscriptions" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can view learning paths" ON "public"."learning_paths" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Anyone can view public decks" ON "public"."decks" FOR SELECT USING ((("is_public" = true) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Authenticated members read league standings" ON "public"."league_memberships" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable insert for service role" ON "public"."profiles" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "League seasons are public-readable" ON "public"."league_seasons" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Members read assignments" ON "public"."assignments" FOR SELECT TO "authenticated" USING ("public"."is_class_member"("classroom_id"));



CREATE POLICY "Members read classroom memberships" ON "public"."classroom_memberships" FOR SELECT TO "authenticated" USING ("public"."is_class_member"("classroom_id"));



CREATE POLICY "Members read classrooms" ON "public"."classrooms" FOR SELECT TO "authenticated" USING ((("owner_id" = "auth"."uid"()) OR "public"."is_class_member"("id")));



CREATE POLICY "Owners add cards to their own decks" ON "public"."cards" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."decks" "d"
  WHERE (("d"."id" = "cards"."deck_id") AND ("d"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Owners delete cards in their own decks" ON "public"."cards" FOR DELETE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."decks" "d"
  WHERE (("d"."id" = "cards"."deck_id") AND ("d"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Owners edit cards in their own decks" ON "public"."cards" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."decks" "d"
  WHERE (("d"."id" = "cards"."deck_id") AND ("d"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."decks" "d"
  WHERE (("d"."id" = "cards"."deck_id") AND ("d"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Owners manage their push tokens" ON "public"."push_tokens" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Owners read cards in their own decks" ON "public"."cards" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."decks" "d"
  WHERE (("d"."id" = "cards"."deck_id") AND ("d"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Public profiles are viewable by everyone." ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Self or teacher reads assignment progress" ON "public"."assignment_progress" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_class_teacher"("classroom_id")));



CREATE POLICY "Service role can delete subscription data" ON "public"."stripe_subscriptions" FOR DELETE TO "service_role" USING (true);



CREATE POLICY "Service role can insert audit events" ON "public"."audit_events" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can insert customer data" ON "public"."stripe_customers" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Service role can insert email preferences" ON "public"."email_preferences" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Service role can insert profile" ON "public"."profiles" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Service role can insert subscription data" ON "public"."stripe_subscriptions" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Service role can select customer data" ON "public"."stripe_customers" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "Service role can select subscription data" ON "public"."stripe_subscriptions" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "Service role can update customer data" ON "public"."stripe_customers" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can update subscription data" ON "public"."stripe_subscriptions" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Shared users can accept deck shares" ON "public"."shared_decks" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."email")::"text" = "shared_decks"."shared_with_email"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."email")::"text" = "shared_decks"."shared_with_email")))));



CREATE POLICY "Super admins can delete admin roles" ON "public"."admin_roles" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "Super admins can grant admin roles" ON "public"."admin_roles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "Super admins can update admin roles" ON "public"."admin_roles" FOR UPDATE TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"())) WITH CHECK ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "Super admins can view all admin roles" ON "public"."admin_roles" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "Super admins can view all client errors" ON "public"."client_errors" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "Super admins can view all performance metrics" ON "public"."performance_metrics" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"("auth"."uid"()));



CREATE POLICY "Users can create own decks" ON "public"."decks" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create shared decks for their own decks" ON "public"."shared_decks" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."decks"
  WHERE (("decks"."id" = "shared_decks"."deck_id") AND ("decks"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete own decks" ON "public"."decks" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own profile" ON "public"."profiles" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can delete shared decks they created" ON "public"."shared_decks" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can delete their own enrollments" ON "public"."learning_path_enrollments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own FSRS params" ON "public"."user_fsrs_params" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own analytics" ON "public"."analytics" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own card reviews" ON "public"."card_reviews" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own chat logs" ON "public"."chat_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own chats" ON "public"."chat_history" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own client errors" ON "public"."client_errors" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own email preferences" ON "public"."email_preferences" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own fact check history" ON "public"."fact_check_history" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own performance metrics" ON "public"."performance_metrics" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own profile" ON "public"."user_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile row" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own study sessions" ON "public"."study_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own enrollments" ON "public"."learning_path_enrollments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own profile." ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can read own FSRS params" ON "public"."user_fsrs_params" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own card reviews" ON "public"."card_reviews" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own profile row" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own FSRS params" ON "public"."user_fsrs_params" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own decks" ON "public"."decks" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own email preferences" ON "public"."email_preferences" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can update own profile" ON "public"."user_profiles" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile row" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile." ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own study sessions" ON "public"."study_sessions" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own subscription" ON "public"."subscriptions" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update shared decks they created" ON "public"."shared_decks" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "owner_id")) WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can update their own enrollments" ON "public"."learning_path_enrollments" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view decks shared with them" ON "public"."shared_decks" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."email")::"text" = "shared_decks"."shared_with_email")))));



CREATE POLICY "Users can view own ai logs" ON "public"."ai_generation_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own chat logs" ON "public"."chat_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own chats" ON "public"."chat_history" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own email preferences" ON "public"."email_preferences" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own fact check history" ON "public"."fact_check_history" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own password reset tokens" ON "public"."password_reset_tokens" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can view own profile" ON "public"."user_profiles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own study sessions" ON "public"."study_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own subscription" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own usage" ON "public"."ai_generation_usage" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view shared decks they own" ON "public"."shared_decks" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can view their own customer data" ON "public"."stripe_customers" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own enrollments" ON "public"."learning_path_enrollments" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own order data" ON "public"."stripe_orders" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."stripe_customers"
  WHERE (("stripe_customers"."customer_id" = "stripe_orders"."customer_id") AND ("stripe_customers"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can view their own subscription data" ON "public"."stripe_subscriptions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."stripe_customers"
  WHERE (("stripe_customers"."customer_id" = "stripe_subscriptions"."customer_id") AND ("stripe_customers"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users view own login notifications" ON "public"."login_email_events" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."_backup_cards_legacy_srs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_chat_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_chat_sessions_delete_own" ON "public"."ai_chat_sessions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "ai_chat_sessions_insert_own" ON "public"."ai_chat_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "ai_chat_sessions_select_own" ON "public"."ai_chat_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "ai_chat_sessions_update_own" ON "public"."ai_chat_sessions" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."ai_generation_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_generation_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignment_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."card_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."card_reviews_backfill_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classroom_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classrooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_errors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."debug_email_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."decks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fact_check_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."league_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."league_seasons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learning_path_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learning_paths" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."login_email_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."password_reset_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."performance_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."processed_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schema_migrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service role write debug logs" ON "public"."debug_email_logs" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."shared_decks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "super admin read all welcome emails" ON "public"."welcome_email_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_roles" "ar"
  WHERE (("ar"."user_id" = "auth"."uid"()) AND ("ar"."role" = 'super_admin'::"text") AND "ar"."is_active"))));



CREATE POLICY "user can read own welcome email events" ON "public"."welcome_email_events" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_fsrs_params" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."welcome_email_events" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_class_deck"("p_assignment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_class_deck"("p_assignment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_class_deck"("p_assignment_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_events_handler"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_events_handler"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_events_handler"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."avatar_upload_secure"("p_filename" "text", "p_mime_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."avatar_upload_secure"("p_filename" "text", "p_mime_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avatar_upload_secure"("p_filename" "text", "p_mime_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."broadcast_user_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."broadcast_user_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."bump_forks_and_unpublish"("p_deck_id" "uuid", "p_unpublish" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bump_forks_and_unpublish"("p_deck_id" "uuid", "p_unpublish" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_forks_and_unpublish"("p_deck_id" "uuid", "p_unpublish" boolean) TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."assignments" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."assignments" TO "service_role";



REVOKE ALL ON FUNCTION "public"."classroom_quiz_assignment"("p_assignment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."classroom_quiz_assignment"("p_assignment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."classroom_quiz_cards"("p_deck_id" "uuid", "p_owner" "uuid", "p_student" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."classroom_quiz_cards"("p_deck_id" "uuid", "p_owner" "uuid", "p_student" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."classroom_roster"("p_classroom_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."classroom_roster"("p_classroom_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."classroom_roster"("p_classroom_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."classroom_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."classroom_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."classroom_touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."count_user_lapses"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."count_user_lapses"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_user_lapses"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_assignment"("p_classroom_id" "uuid", "p_title" "text", "p_instructions" "text", "p_kind" "text", "p_deck_id" "uuid", "p_payload" "jsonb", "p_start_at" timestamp with time zone, "p_due_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_assignment"("p_classroom_id" "uuid", "p_title" "text", "p_instructions" "text", "p_kind" "text", "p_deck_id" "uuid", "p_payload" "jsonb", "p_start_at" timestamp with time zone, "p_due_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_assignment"("p_classroom_id" "uuid", "p_title" "text", "p_instructions" "text", "p_kind" "text", "p_deck_id" "uuid", "p_payload" "jsonb", "p_start_at" timestamp with time zone, "p_due_at" timestamp with time zone) TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."classrooms" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."classrooms" TO "authenticated";
GRANT ALL ON TABLE "public"."classrooms" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_classroom"("p_title" "text", "p_description" "text", "p_subject" "text", "p_color" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_classroom"("p_title" "text", "p_description" "text", "p_subject" "text", "p_color" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_classroom"("p_title" "text", "p_description" "text", "p_subject" "text", "p_color" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_email_preferences_for_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_email_preferences_for_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."deactivate_admin"("target_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deactivate_admin"("target_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."deactivate_admin"("target_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."deck_card_counts"("p_deck_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deck_card_counts"("p_deck_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."deck_card_counts"("p_deck_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_assignment"("p_assignment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_assignment"("p_assignment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_assignment"("p_assignment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_classroom"("p_classroom_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_classroom"("p_classroom_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_classroom"("p_classroom_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."execute_sql"("query_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."execute_sql"("query_text" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fork_public_deck"("p_deck_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fork_public_deck"("p_deck_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fork_public_deck"("p_deck_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_class_invite_code"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_class_invite_code"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_quiz_questions"("p_assignment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_quiz_questions"("p_assignment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_quiz_questions"("p_assignment_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_enrolled_count"("path_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_enrolled_count"("path_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_enrolled_count"("path_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_weekly_xp"("p_user_id" "uuid", "p_group_id" "text", "p_tier" integer, "p_xp_delta" integer, "p_accuracy" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_weekly_xp"("p_user_id" "uuid", "p_group_id" "text", "p_tier" integer, "p_xp_delta" integer, "p_accuracy" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_weekly_xp"("p_user_id" "uuid", "p_group_id" "text", "p_tier" integer, "p_xp_delta" integer, "p_accuracy" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"("user_uuid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"("user_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_class_member"("p_classroom_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_class_member"("p_classroom_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_class_member"("p_classroom_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_class_teacher"("p_classroom_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_class_teacher"("p_classroom_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_class_teacher"("p_classroom_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_super_admin"("user_uuid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_super_admin"("user_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_classroom_with_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_classroom_with_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_classroom_with_code"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."league_group_roster"("p_group_id" "text", "p_season_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."league_group_roster"("p_group_id" "text", "p_season_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."league_group_roster"("p_group_id" "text", "p_season_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."league_memberships_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."league_memberships_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."league_memberships_touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."leave_classroom"("p_classroom_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leave_classroom"("p_classroom_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_classroom"("p_classroom_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_admin_users_secure"("p_search_term" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_admin_users_secure"("p_search_term" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_admin_users_secure"("p_search_term" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_public_decks"("p_search" "text", "p_category" "text", "p_sort" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_public_decks"("p_search" "text", "p_category" "text", "p_sort" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_public_decks"("p_search" "text", "p_category" "text", "p_sort" "text", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."promote_admin"("target_user" "uuid", "new_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."promote_admin"("target_user" "uuid", "new_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."promote_admin"("target_user" "uuid", "new_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_old_chat_sessions"("p_user_id" "uuid", "p_max_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_old_chat_sessions"("p_user_id" "uuid", "p_max_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."prune_old_chat_sessions"("p_user_id" "uuid", "p_max_count" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_processed_webhook_events"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_processed_webhook_events"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_assignment_progress"("p_assignment_id" "uuid", "p_local_deck_id" "uuid", "p_quiz_correct" integer, "p_quiz_total" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_assignment_progress"("p_assignment_id" "uuid", "p_local_deck_id" "uuid", "p_quiz_correct" integer, "p_quiz_total" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_assignment_progress"("p_assignment_id" "uuid", "p_local_deck_id" "uuid", "p_quiz_correct" integer, "p_quiz_total" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_card_review"("p_card_id" "uuid", "p_rating" integer, "p_srs_result" "jsonb", "p_user_id" "uuid", "p_srs_algorithm" "text", "p_reviewed_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_card_review"("p_card_id" "uuid", "p_rating" integer, "p_srs_result" "jsonb", "p_user_id" "uuid", "p_srs_algorithm" "text", "p_reviewed_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_card_review"("p_card_id" "uuid", "p_rating" integer, "p_srs_result" "jsonb", "p_user_id" "uuid", "p_srs_algorithm" "text", "p_reviewed_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_class_invite_code"("p_classroom_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_class_invite_code"("p_classroom_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_class_invite_code"("p_classroom_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_classroom_member"("p_classroom_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_classroom_member"("p_classroom_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_classroom_member"("p_classroom_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_class_member_role"("p_classroom_id" "uuid", "p_user_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_class_member_role"("p_classroom_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_class_member_role"("p_classroom_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_quiz_attempt"("p_assignment_id" "uuid", "p_answers" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_quiz_attempt"("p_assignment_id" "uuid", "p_answers" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_quiz_attempt"("p_assignment_id" "uuid", "p_answers" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_auth_role_to_profiles"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_auth_role_to_profiles"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."toggle_admin_secure"("p_target_uuid" "uuid", "p_make_admin" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."toggle_admin_secure"("p_target_uuid" "uuid", "p_make_admin" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_admin_secure"("p_target_uuid" "uuid", "p_make_admin" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ai_chat_sessions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ai_chat_sessions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ai_chat_sessions_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_assignment"("p_assignment_id" "uuid", "p_title" "text", "p_instructions" "text", "p_start_at" timestamp with time zone, "p_due_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_assignment"("p_assignment_id" "uuid", "p_title" "text", "p_instructions" "text", "p_start_at" timestamp with time zone, "p_due_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_assignment"("p_assignment_id" "uuid", "p_title" "text", "p_instructions" "text", "p_start_at" timestamp with time zone, "p_due_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_classroom"("p_classroom_id" "uuid", "p_title" "text", "p_description" "text", "p_subject" "text", "p_color" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_classroom"("p_classroom_id" "uuid", "p_title" "text", "p_description" "text", "p_subject" "text", "p_color" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_classroom"("p_classroom_id" "uuid", "p_title" "text", "p_description" "text", "p_subject" "text", "p_color" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_league_memberships_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_league_memberships_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_league_memberships_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_profiles_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_profiles_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_profiles_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_user_fsrs_params"("p_user_id" "uuid", "p_weights" "jsonb", "p_review_count" integer, "p_accuracy_baseline" numeric, "p_loss_value" numeric, "p_profile_label" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_user_fsrs_params"("p_user_id" "uuid", "p_weights" "jsonb", "p_review_count" integer, "p_accuracy_baseline" numeric, "p_loss_value" numeric, "p_profile_label" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_user_fsrs_params"("p_user_id" "uuid", "p_weights" "jsonb", "p_review_count" integer, "p_accuracy_baseline" numeric, "p_loss_value" numeric, "p_profile_label" "text") TO "service_role";



GRANT ALL ON TABLE "public"."_backup_cards_legacy_srs" TO "anon";
GRANT ALL ON TABLE "public"."_backup_cards_legacy_srs" TO "authenticated";
GRANT ALL ON TABLE "public"."_backup_cards_legacy_srs" TO "service_role";



GRANT ALL ON TABLE "public"."admin_activity_log" TO "anon";
GRANT ALL ON TABLE "public"."admin_activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."admin_roles" TO "anon";
GRANT ALL ON TABLE "public"."admin_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_roles" TO "service_role";



GRANT ALL ON TABLE "public"."ai_chat_sessions" TO "anon";
GRANT ALL ON TABLE "public"."ai_chat_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_chat_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."ai_generation_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_generation_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_generation_logs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_generation_usage" TO "anon";
GRANT ALL ON TABLE "public"."ai_generation_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_generation_usage" TO "service_role";



GRANT ALL ON TABLE "public"."analytics" TO "anon";
GRANT ALL ON TABLE "public"."analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."assignment_progress" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."assignment_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_progress" TO "service_role";



GRANT ALL ON TABLE "public"."audit_events" TO "anon";
GRANT ALL ON TABLE "public"."audit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_events" TO "service_role";



GRANT ALL ON TABLE "public"."cards" TO "anon";
GRANT ALL ON TABLE "public"."cards" TO "authenticated";
GRANT ALL ON TABLE "public"."cards" TO "service_role";



GRANT ALL ON TABLE "public"."card_analytics" TO "anon";
GRANT ALL ON TABLE "public"."card_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."card_analytics" TO "service_role";



GRANT ALL ON TABLE "public"."card_reviews" TO "anon";
GRANT ALL ON TABLE "public"."card_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."card_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."card_reviews_backfill_audit" TO "anon";
GRANT ALL ON TABLE "public"."card_reviews_backfill_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."card_reviews_backfill_audit" TO "service_role";



GRANT ALL ON TABLE "public"."chat_history" TO "anon";
GRANT ALL ON TABLE "public"."chat_history" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_history" TO "service_role";



GRANT ALL ON TABLE "public"."chat_logs" TO "anon";
GRANT ALL ON TABLE "public"."chat_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_logs" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."classroom_memberships" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."classroom_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."classroom_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."client_errors" TO "anon";
GRANT ALL ON TABLE "public"."client_errors" TO "authenticated";
GRANT ALL ON TABLE "public"."client_errors" TO "service_role";



GRANT ALL ON TABLE "public"."debug_email_logs" TO "anon";
GRANT ALL ON TABLE "public"."debug_email_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."debug_email_logs" TO "service_role";



GRANT ALL ON TABLE "public"."decks" TO "anon";
GRANT ALL ON TABLE "public"."decks" TO "authenticated";
GRANT ALL ON TABLE "public"."decks" TO "service_role";



GRANT ALL ON TABLE "public"."email_preferences" TO "anon";
GRANT ALL ON TABLE "public"."email_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."email_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."fact_check_history" TO "anon";
GRANT ALL ON TABLE "public"."fact_check_history" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_check_history" TO "service_role";



GRANT ALL ON TABLE "public"."league_memberships" TO "anon";
GRANT ALL ON TABLE "public"."league_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."league_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."league_seasons" TO "anon";
GRANT ALL ON TABLE "public"."league_seasons" TO "authenticated";
GRANT ALL ON TABLE "public"."league_seasons" TO "service_role";



GRANT ALL ON TABLE "public"."learning_path_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."learning_path_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_path_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."learning_paths" TO "anon";
GRANT ALL ON TABLE "public"."learning_paths" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_paths" TO "service_role";



GRANT ALL ON TABLE "public"."login_email_events" TO "anon";
GRANT ALL ON TABLE "public"."login_email_events" TO "authenticated";
GRANT ALL ON TABLE "public"."login_email_events" TO "service_role";



GRANT ALL ON TABLE "public"."password_reset_tokens" TO "anon";
GRANT ALL ON TABLE "public"."password_reset_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."password_reset_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."performance_metrics" TO "anon";
GRANT ALL ON TABLE "public"."performance_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."performance_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."processed_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."processed_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."processed_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."schema_migrations" TO "anon";
GRANT ALL ON TABLE "public"."schema_migrations" TO "authenticated";
GRANT ALL ON TABLE "public"."schema_migrations" TO "service_role";



GRANT ALL ON TABLE "public"."shared_decks" TO "anon";
GRANT ALL ON TABLE "public"."shared_decks" TO "authenticated";
GRANT ALL ON TABLE "public"."shared_decks" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_customers" TO "anon";
GRANT ALL ON TABLE "public"."stripe_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_customers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."stripe_customers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stripe_customers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stripe_customers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_orders" TO "anon";
GRANT ALL ON TABLE "public"."stripe_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_orders" TO "service_role";



GRANT ALL ON SEQUENCE "public"."stripe_orders_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stripe_orders_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stripe_orders_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."stripe_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_subscriptions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."stripe_subscriptions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stripe_subscriptions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stripe_subscriptions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_user_orders" TO "anon";
GRANT ALL ON TABLE "public"."stripe_user_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_user_orders" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_user_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."stripe_user_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_user_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."study_sessions" TO "anon";
GRANT ALL ON TABLE "public"."study_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."study_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."user_fsrs_params" TO "anon";
GRANT ALL ON TABLE "public"."user_fsrs_params" TO "authenticated";
GRANT ALL ON TABLE "public"."user_fsrs_params" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_profiles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT UPDATE("full_name") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT UPDATE("theme_preference") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT UPDATE("streak") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT UPDATE("last_active") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT UPDATE("study_preferences") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT UPDATE("email") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT UPDATE("xp") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT UPDATE("level") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT UPDATE("streak_days") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT UPDATE("cards_studied") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT UPDATE("decks_created") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT UPDATE("sessions_completed") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT UPDATE("title") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT UPDATE("last_study_date") ON TABLE "public"."user_profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."welcome_email_events" TO "anon";
GRANT ALL ON TABLE "public"."welcome_email_events" TO "authenticated";
GRANT ALL ON TABLE "public"."welcome_email_events" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








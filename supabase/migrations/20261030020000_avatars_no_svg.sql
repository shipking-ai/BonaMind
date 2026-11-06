-- Avatars: stop accepting SVG uploads on the server side too.
--
-- The upload screens already dropped SVG. This removes it from the bucket's
-- allowed types and from the avatar_upload_secure() helper. Files already in
-- the bucket are not touched.
--
-- IDEMPOTENT: array_remove and CREATE OR REPLACE are safe to repeat.

UPDATE storage.buckets
SET allowed_mime_types = array_remove(allowed_mime_types, 'image/svg+xml')
WHERE id = 'avatars';

CREATE OR REPLACE FUNCTION avatar_upload_secure(
  p_filename  TEXT,
  p_mime_type TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, storage
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

-- ── Bookkeeping ─────────────────────────────────────────────────────────
INSERT INTO schema_migrations (version, description)
VALUES (
  '20261030020000_avatars_no_svg',
  'avatars bucket and avatar_upload_secure no longer accept image/svg+xml'
)
ON CONFLICT (version) DO NOTHING;

-- ─── Bucket Supabase Storage : avatars ────────────────────────────────────────
-- A coller dans Supabase Dashboard -> SQL Editor et executer.

-- 1. Cree le bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policies (syntaxe DO $$ compatible PostgreSQL)

-- Lecture publique
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'avatars_public_select'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY avatars_public_select
        ON storage.objects FOR SELECT
        USING (bucket_id = 'avatars')
    $pol$;
  END IF;
END $$;

-- Upload (tout wallet connecte peut uploader dans son dossier)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'avatars_insert_own'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY avatars_insert_own
        ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = 'avatars')
    $pol$;
  END IF;
END $$;

-- Remplacement de l'avatar existant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'avatars_update_own'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY avatars_update_own
        ON storage.objects FOR UPDATE
        USING (bucket_id = 'avatars')
    $pol$;
  END IF;
END $$;

-- Suppression
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'avatars_delete_own'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY avatars_delete_own
        ON storage.objects FOR DELETE
        USING (bucket_id = 'avatars')
    $pol$;
  END IF;
END $$;

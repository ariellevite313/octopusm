-- ─── Bucket Supabase Storage : avatars ────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Lecture publique (avatars visibles par tous)
CREATE POLICY IF NOT EXISTS "avatars_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Upload : tout wallet authentifié peut uploader dans son dossier
CREATE POLICY IF NOT EXISTS "avatars_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars');

-- Remplacement : peut écraser son propre avatar
CREATE POLICY IF NOT EXISTS "avatars_update_own"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars');

-- Suppression
CREATE POLICY IF NOT EXISTS "avatars_delete_own"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars');

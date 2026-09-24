-- ──────────────────────────────────────────────────────────────────────────────
-- Make the market-images storage bucket public so token logos are accessible
-- to Phantom, Jupiter, DexScreener, and other external indexers.
--
-- Run this ONCE in production via:  supabase db push  or Supabase dashboard → SQL editor
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Create the bucket if it doesn't already exist, and mark it public.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'market-images',
  'market-images',
  true,              -- makes /storage/v1/object/public/market-images/* accessible without auth
  5242880,           -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public            = true,
      file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Allow anyone to read objects in this bucket (required even when bucket is public).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'market-images public read'
  ) THEN
    CREATE POLICY "market-images public read"
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'market-images');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : replies + likes sur les commentaires de marché
-- À exécuter dans Supabase SQL Editor après 20240707_market_comments_resolution.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Ajouter parent_id pour les réponses imbriquées
ALTER TABLE market_comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES market_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_market_comments_parent_id
  ON market_comments(parent_id);

-- 2. Table des likes sur les commentaires
CREATE TABLE IF NOT EXISTS market_comment_likes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id      UUID NOT NULL REFERENCES market_comments(id) ON DELETE CASCADE,
  wallet_address  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comment_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id
  ON market_comment_likes(comment_id);

-- 3. RLS sur market_comment_likes
ALTER TABLE market_comment_likes ENABLE ROW LEVEL SECURITY;

-- Lecture publique
CREATE POLICY "comment_likes_read_all"
  ON market_comment_likes FOR SELECT
  USING (true);

-- Like : tout wallet authentifié
CREATE POLICY "comment_likes_insert_authenticated"
  ON market_comment_likes FOR INSERT
  WITH CHECK (wallet_address = get_wallet_address());

-- Unlike : seulement le propriétaire du like
CREATE POLICY "comment_likes_delete_own"
  ON market_comment_likes FOR DELETE
  USING (wallet_address = get_wallet_address());

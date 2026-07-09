-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : resolution_criteria + market_comments
-- À exécuter dans Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Ajouter la colonne resolution_criteria à prediction_markets
ALTER TABLE prediction_markets
  ADD COLUMN IF NOT EXISTS resolution_criteria TEXT DEFAULT NULL;

-- 2. Créer la table market_comments
CREATE TABLE IF NOT EXISTS market_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id       UUID NOT NULL REFERENCES prediction_markets(id) ON DELETE CASCADE,
  wallet_address  TEXT NOT NULL,
  username        TEXT,
  avatar_src      TEXT,
  content         TEXT NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 1000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Index pour les requêtes par marché
CREATE INDEX IF NOT EXISTS idx_market_comments_market_id
  ON market_comments(market_id, created_at DESC);

-- 4. RLS
ALTER TABLE market_comments ENABLE ROW LEVEL SECURITY;

-- Lecture publique
CREATE POLICY "market_comments_read_all"
  ON market_comments FOR SELECT
  USING (true);

-- Écriture : tout wallet authentifié (via get_wallet_address())
CREATE POLICY "market_comments_insert_authenticated"
  ON market_comments FOR INSERT
  WITH CHECK (wallet_address = get_wallet_address());

-- Suppression : auteur uniquement
CREATE POLICY "market_comments_delete_own"
  ON market_comments FOR DELETE
  USING (wallet_address = get_wallet_address());

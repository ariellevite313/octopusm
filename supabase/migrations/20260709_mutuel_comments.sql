-- Migration: mutuel_market_comments table
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS mutuel_market_comments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id      UUID NOT NULL REFERENCES mutuel_markets(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  username       TEXT,
  avatar_src     TEXT,
  content        TEXT NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 1000),
  parent_id      UUID REFERENCES mutuel_market_comments(id) ON DELETE CASCADE,
  like_count     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mutuel_market_comments_market_id_idx ON mutuel_market_comments(market_id);
CREATE INDEX IF NOT EXISTS mutuel_market_comments_parent_id_idx ON mutuel_market_comments(parent_id);

CREATE TABLE IF NOT EXISTS mutuel_market_comment_likes (
  comment_id     UUID NOT NULL REFERENCES mutuel_market_comments(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  PRIMARY KEY (comment_id, wallet_address)
);

-- RLS: allow all reads, writes via service role only (API routes use createAdminClient)
ALTER TABLE mutuel_market_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutuel_market_comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mutuel_comments_read" ON mutuel_market_comments;
CREATE POLICY "mutuel_comments_read" ON mutuel_market_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "mutuel_comment_likes_read" ON mutuel_market_comment_likes;
CREATE POLICY "mutuel_comment_likes_read" ON mutuel_market_comment_likes FOR SELECT USING (true);

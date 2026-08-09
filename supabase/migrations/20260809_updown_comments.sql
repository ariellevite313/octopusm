-- Comments for UP/DOWN markets (separate from prediction_markets comments)
CREATE TABLE IF NOT EXISTS updown_market_comments (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id      uuid        NOT NULL,
  parent_id      uuid        REFERENCES updown_market_comments(id) ON DELETE CASCADE,
  wallet_address text        NOT NULL,
  username       text,
  avatar_src     text,
  content        text        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  like_count     integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_updown_comments_market ON updown_market_comments (market_id, created_at ASC);

CREATE TABLE IF NOT EXISTS updown_market_comment_likes (
  comment_id     uuid        NOT NULL REFERENCES updown_market_comments(id) ON DELETE CASCADE,
  wallet_address text        NOT NULL,
  PRIMARY KEY (comment_id, wallet_address)
);

-- RLS
ALTER TABLE updown_market_comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE updown_market_comment_likes  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read comments"      ON updown_market_comments      FOR SELECT USING (true);
CREATE POLICY "Public read likes"         ON updown_market_comment_likes  FOR SELECT USING (true);
CREATE POLICY "Service role all comments" ON updown_market_comments      USING (auth.role() = 'service_role');
CREATE POLICY "Service role all likes"    ON updown_market_comment_likes  USING (auth.role() = 'service_role');

-- ─── Match ID for World Cup 2026 live scores ─────────────────────────────────
-- Adds match_id (1–104) to prediction_markets.
-- Null = non-sports market.  1–104 = World Cup 2026 match.

ALTER TABLE prediction_markets
  ADD COLUMN IF NOT EXISTS match_id INTEGER;

-- Hard constraint: value must be in valid range or null
ALTER TABLE prediction_markets
  DROP CONSTRAINT IF EXISTS chk_match_id_range;

ALTER TABLE prediction_markets
  ADD CONSTRAINT chk_match_id_range
  CHECK (match_id IS NULL OR (match_id >= 1 AND match_id <= 104));

-- Index for fast lookup by match (e.g. auto-resolve cron)
CREATE INDEX IF NOT EXISTS idx_prediction_markets_match_id
  ON prediction_markets(match_id)
  WHERE match_id IS NOT NULL;

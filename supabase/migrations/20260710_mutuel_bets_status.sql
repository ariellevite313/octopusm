-- Add status column to mutuel_bets for individual admin approval
ALTER TABLE mutuel_bets ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- Index for efficient admin panel queries
CREATE INDEX IF NOT EXISTS mutuel_bets_status_idx ON mutuel_bets (status);
CREATE INDEX IF NOT EXISTS mutuel_bets_market_status_idx ON mutuel_bets (market_id, status);

-- Add claimed_at and paid_at columns to updown_bets if they don't exist
ALTER TABLE updown_bets
  ADD COLUMN IF NOT EXISTS claimed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at     TIMESTAMPTZ;

-- Index for admin query (claimed + paid bets, ordered by claimed_at)
CREATE INDEX IF NOT EXISTS updown_bets_status_claimed_at
  ON updown_bets (status, claimed_at DESC)
  WHERE status IN ('claimed', 'paid');

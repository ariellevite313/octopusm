-- Add is_refund column to mutuel_markets for reliable refund detection
ALTER TABLE mutuel_markets
  ADD COLUMN IF NOT EXISTS is_refund BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill existing cancelled markets
UPDATE mutuel_markets SET is_refund = TRUE WHERE status = 'cancelled';

-- Backfill existing all-on-winner resolved markets (detected via admin_notes)
UPDATE mutuel_markets
SET is_refund = TRUE
WHERE status = 'resolved'
  AND admin_notes LIKE '%REFUND%all bettors%';

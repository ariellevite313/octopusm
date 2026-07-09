-- ============================================================
-- Add fee_refunded_at column to mutuel_markets
-- Replaces the FEE_REFUNDED: marker stored in admin_notes
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE mutuel_markets
  ADD COLUMN IF NOT EXISTS fee_refunded_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fee_refund_tx TEXT DEFAULT NULL;

-- Backfill: parse existing FEE_REFUNDED: markers from admin_notes
-- (safe to run even if no rows match)
UPDATE mutuel_markets
SET fee_refunded_at = NOW()
WHERE admin_notes LIKE '%FEE_REFUNDED:%'
  AND fee_refunded_at IS NULL;

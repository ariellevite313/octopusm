-- ============================================================
-- Performance indexes for mutuel_bets and mutuel_markets
-- Run in Supabase SQL Editor
-- ============================================================

-- Speeds up /api/pools/my-bets and /api/pools/winnings (filter by wallet)
CREATE INDEX IF NOT EXISTS idx_mutuel_bets_wallet_address
  ON mutuel_bets (wallet_address);

-- Speeds up payout queries (unpaid winners)
CREATE INDEX IF NOT EXISTS idx_mutuel_bets_payout_unpaid
  ON mutuel_bets (market_id, payout_amount, paid_at)
  WHERE payout_amount IS NOT NULL AND paid_at IS NULL;

-- Speeds up admin panel listing by status
CREATE INDEX IF NOT EXISTS idx_mutuel_markets_status
  ON mutuel_markets (status, created_at DESC);

-- Speeds up pool lookup by slug
CREATE INDEX IF NOT EXISTS idx_mutuel_markets_slug
  ON mutuel_markets (slug);

-- Speeds up pending payments for pool predictions
CREATE INDEX IF NOT EXISTS idx_payments_pool_pending
  ON payments (user_wallet, flow, status)
  WHERE flow = 'pool_prediction' AND status = 'pending';

-- ============================================================
-- Pari Mutuel System — mutuel_markets + mutuel_bets
-- Run once in Supabase SQL editor
-- ============================================================

SET search_path TO public, extensions;

-- ── 1. Status enum ────────────────────────────────────────────
CREATE TYPE mutuel_market_status AS ENUM (
  'pending',    -- waiting for admin approval
  'active',     -- open for bets
  'closed',     -- betting period ended, awaiting resolution
  'resolved',   -- admin resolved, payouts distributed
  'rejected'    -- admin rejected (creation fee refunded)
);

-- ── 2. mutuel_markets ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mutuel_markets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                TEXT UNIQUE NOT NULL,
  creator_wallet      TEXT NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT,
  -- options stored as JSONB array: [{id, label}]
  options             JSONB NOT NULL DEFAULT '[]',
  category            TEXT NOT NULL DEFAULT 'general',
  -- Creation fee
  creation_fee_token  TEXT NOT NULL CHECK (creation_fee_token IN ('usdc', 'clawdtrust')),
  creation_fee_amount NUMERIC(20,6) NOT NULL,
  creation_tx         TEXT,               -- on-chain tx signature
  -- Timing
  betting_closes_at   TIMESTAMPTZ NOT NULL,
  -- State
  status              mutuel_market_status NOT NULL DEFAULT 'pending',
  admin_notes         TEXT,               -- rejection reason
  resolved_by_wallet  TEXT REFERENCES wallets(address),
  winning_option_id   TEXT,              -- id of the winning option
  resolved_at         TIMESTAMPTZ,
  -- Stats (denormalised for display performance)
  total_pool_usdc     NUMERIC(20,6) NOT NULL DEFAULT 0,
  total_pool_clt      NUMERIC(20,6) NOT NULL DEFAULT 0,
  bet_count           INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. mutuel_bets ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mutuel_bets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id       UUID NOT NULL REFERENCES mutuel_markets(id) ON DELETE CASCADE,
  wallet_address  TEXT NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
  option_id       TEXT NOT NULL,         -- matches options[].id in mutuel_markets
  amount          NUMERIC(20,6) NOT NULL CHECK (amount > 0),
  token           TEXT NOT NULL CHECK (token IN ('usdc', 'clawdtrust')),
  tx_signature    TEXT,                  -- on-chain tx
  -- Payout
  payout_amount   NUMERIC(20,6),
  payout_tx       TEXT,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS mutuel_markets_status_idx    ON mutuel_markets(status);
CREATE INDEX IF NOT EXISTS mutuel_markets_creator_idx   ON mutuel_markets(creator_wallet);
CREATE INDEX IF NOT EXISTS mutuel_bets_market_idx       ON mutuel_bets(market_id);
CREATE INDEX IF NOT EXISTS mutuel_bets_wallet_idx       ON mutuel_bets(wallet_address);
CREATE INDEX IF NOT EXISTS mutuel_bets_market_opt_idx   ON mutuel_bets(market_id, option_id);

-- ── 5. updated_at trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER mutuel_markets_updated_at
  BEFORE UPDATE ON mutuel_markets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 6. RLS ───────────────────────────────────────────────────
ALTER TABLE mutuel_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutuel_bets    ENABLE ROW LEVEL SECURITY;

-- mutuel_markets policies
CREATE POLICY "mutuel_markets_public_read"
  ON mutuel_markets FOR SELECT
  USING (status IN ('active', 'closed', 'resolved'));

CREATE POLICY "mutuel_markets_creator_read_own"
  ON mutuel_markets FOR SELECT
  USING (creator_wallet = get_wallet_address());

CREATE POLICY "mutuel_markets_admin_all"
  ON mutuel_markets FOR ALL
  USING (is_admin());

CREATE POLICY "mutuel_markets_insert_authed"
  ON mutuel_markets FOR INSERT
  WITH CHECK (creator_wallet = get_wallet_address());

-- mutuel_bets policies
CREATE POLICY "mutuel_bets_public_read"
  ON mutuel_bets FOR SELECT
  USING (TRUE);   -- bets are public (no sensitive data)

CREATE POLICY "mutuel_bets_insert_authed"
  ON mutuel_bets FOR INSERT
  WITH CHECK (
    wallet_address = get_wallet_address()
    AND EXISTS (
      SELECT 1 FROM mutuel_markets m
      WHERE m.id = market_id
        AND m.status = 'active'
        AND m.betting_closes_at > now()
    )
  );

CREATE POLICY "mutuel_bets_admin_all"
  ON mutuel_bets FOR ALL
  USING (is_admin());

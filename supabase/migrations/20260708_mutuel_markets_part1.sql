-- ============================================================
-- Pari Mutuel System — PART 1: Tables, indexes, trigger
-- ============================================================

CREATE TYPE IF NOT EXISTS mutuel_market_status AS ENUM (
  'pending',
  'active',
  'closed',
  'resolved',
  'rejected'
);

CREATE TABLE IF NOT EXISTS mutuel_markets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                TEXT UNIQUE NOT NULL,
  creator_wallet      TEXT NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT,
  options             JSONB NOT NULL DEFAULT '[]',
  category            TEXT NOT NULL DEFAULT 'general',
  creation_fee_token  TEXT NOT NULL CHECK (creation_fee_token IN ('usdc', 'clawdtrust')),
  creation_fee_amount NUMERIC(20,6) NOT NULL,
  creation_tx         TEXT,
  betting_closes_at   TIMESTAMPTZ NOT NULL,
  status              mutuel_market_status NOT NULL DEFAULT 'pending',
  admin_notes         TEXT,
  resolved_by_wallet  TEXT REFERENCES wallets(address),
  winning_option_id   TEXT,
  resolved_at         TIMESTAMPTZ,
  total_pool_usdc     NUMERIC(20,6) NOT NULL DEFAULT 0,
  total_pool_clt      NUMERIC(20,6) NOT NULL DEFAULT 0,
  bet_count           INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mutuel_bets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id       UUID NOT NULL REFERENCES mutuel_markets(id) ON DELETE CASCADE,
  wallet_address  TEXT NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
  option_id       TEXT NOT NULL,
  amount          NUMERIC(20,6) NOT NULL CHECK (amount > 0),
  token           TEXT NOT NULL CHECK (token IN ('usdc', 'clawdtrust')),
  tx_signature    TEXT,
  payout_amount   NUMERIC(20,6),
  payout_tx       TEXT,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mutuel_markets_status_idx  ON mutuel_markets(status);
CREATE INDEX IF NOT EXISTS mutuel_markets_creator_idx ON mutuel_markets(creator_wallet);
CREATE INDEX IF NOT EXISTS mutuel_bets_market_idx     ON mutuel_bets(market_id);
CREATE INDEX IF NOT EXISTS mutuel_bets_wallet_idx     ON mutuel_bets(wallet_address);
CREATE INDEX IF NOT EXISTS mutuel_bets_market_opt_idx ON mutuel_bets(market_id, option_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mutuel_markets_updated_at ON mutuel_markets;
CREATE TRIGGER mutuel_markets_updated_at
  BEFORE UPDATE ON mutuel_markets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE mutuel_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutuel_bets    ENABLE ROW LEVEL SECURITY;

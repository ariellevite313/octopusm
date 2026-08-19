-- creator_fee_claims
-- Records every successful creator fee claim.
-- Populated by POST /api/dashboard/log-claim after the wallet signs + broadcasts.

CREATE TABLE IF NOT EXISTS creator_fee_claims (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet        TEXT        NOT NULL,
  token_id      UUID        NOT NULL REFERENCES launchpad_tokens(id) ON DELETE CASCADE,
  amount_sol    NUMERIC(18, 9) NOT NULL DEFAULT 0,
  tx_signature  TEXT        NOT NULL,
  claimed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT creator_fee_claims_tx_unique UNIQUE (tx_signature)
);

CREATE INDEX IF NOT EXISTS idx_fee_claims_wallet     ON creator_fee_claims(wallet);
CREATE INDEX IF NOT EXISTS idx_fee_claims_token      ON creator_fee_claims(token_id);
CREATE INDEX IF NOT EXISTS idx_fee_claims_claimed_at ON creator_fee_claims(claimed_at);

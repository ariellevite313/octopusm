-- ──────────────────────────────────────────────────────────────────────────────
-- Extend creator_fee_claims to support Arc chain claims (USDC, EVM tx hashes).
-- ──────────────────────────────────────────────────────────────────────────────

-- chain: "solana" (default, backward-compat) | "arc"
ALTER TABLE public.creator_fee_claims
  ADD COLUMN IF NOT EXISTS chain       text             NOT NULL DEFAULT 'solana',
  ADD COLUMN IF NOT EXISTS amount_usdc numeric(30, 18)  DEFAULT NULL;

-- Index for fast Arc total lookups (column is "wallet", not "wallet_address")
CREATE INDEX IF NOT EXISTS idx_creator_fee_claims_chain
  ON public.creator_fee_claims (chain, wallet);

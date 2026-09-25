-- Add claim_type to creator_fee_claims to distinguish creator fees from holder dividends.
-- Default 'creator' for backward compat — all existing rows are creator fee claims.

ALTER TABLE public.creator_fee_claims
  ADD COLUMN IF NOT EXISTS claim_type text NOT NULL DEFAULT 'creator';

CREATE INDEX IF NOT EXISTS idx_creator_fee_claims_type
  ON public.creator_fee_claims (chain, wallet, claim_type);

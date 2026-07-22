-- Migration: referral_commissions
-- Stores per-bet commissions earned by referrers (1% of bet amount).
-- Written by the API server (service key) when a referred user places a bet.

CREATE TABLE IF NOT EXISTS public.referral_commissions (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_wallet text         NOT NULL,
  referred_wallet text         NOT NULL,
  amount_usdc     numeric      NOT NULL DEFAULT 0,
  amount_clt      numeric      NOT NULL DEFAULT 0,
  created_at      timestamptz  NOT NULL DEFAULT now()
);

-- Indexes for the two common lookups
CREATE INDEX IF NOT EXISTS referral_commissions_referrer_idx
  ON public.referral_commissions (referrer_wallet);

CREATE INDEX IF NOT EXISTS referral_commissions_referred_idx
  ON public.referral_commissions (referred_wallet);

-- RLS: users can only read their OWN earned commissions (as referrer)
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referrer can read own commissions"
  ON public.referral_commissions
  FOR SELECT
  USING (
    referrer_wallet = (
      SELECT (auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    )
  );

-- No INSERT/UPDATE/DELETE for users — only service role writes

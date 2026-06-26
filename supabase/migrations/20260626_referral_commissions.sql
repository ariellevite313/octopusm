-- ─── Referral Commission System ──────────────────────────────────────────────
-- referral_commissions : 5% fee (bet_fee) ou 5% mise perdue (loss_commission)
-- referral_commission_claims : demandes de paiement USDC claimables

-- Table des commissions gagnées par les parrains
CREATE TABLE IF NOT EXISTS public.referral_commissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_wallet  text NOT NULL,
  referred_wallet  text NOT NULL,
  type             text NOT NULL CHECK (type IN ('bet_fee', 'loss_commission')),
  amount_usdc      numeric(12, 4) NOT NULL CHECK (amount_usdc > 0),
  bet_reference    text NOT NULL,          -- payment_reference du pari
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ref_commissions_referrer
  ON public.referral_commissions (referrer_wallet);

CREATE INDEX IF NOT EXISTS idx_ref_commissions_referred
  ON public.referral_commissions (referred_wallet);

CREATE INDEX IF NOT EXISTS idx_ref_commissions_bet_ref
  ON public.referral_commissions (bet_reference, type);

-- Table des réclamations de paiement
CREATE TABLE IF NOT EXISTS public.referral_commission_claims (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_wallet  text NOT NULL,
  total_usdc       numeric(12, 4) NOT NULL CHECK (total_usdc > 0),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at          timestamptz,
  paid_by_wallet   text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ref_claims_referrer
  ON public.referral_commission_claims (referrer_wallet);

CREATE INDEX IF NOT EXISTS idx_ref_claims_status
  ON public.referral_commission_claims (status);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commission_claims ENABLE ROW LEVEL SECURITY;

-- SELECT ouvert (chaque wallet voit ses propres données)
CREATE POLICY "commissions_select" ON public.referral_commissions
  FOR SELECT USING (true);

CREATE POLICY "claims_select" ON public.referral_commission_claims
  FOR SELECT USING (true);

-- Écriture uniquement via service_role (Edge Functions)
-- Pas de policy INSERT/UPDATE/DELETE pour anon → bloqué par RLS

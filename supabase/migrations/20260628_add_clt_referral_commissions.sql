-- Migration : support CLT dans referral_commissions et referral_commission_claims
-- À appliquer via : supabase db push  (ou coller dans le SQL editor Supabase)

-- referral_commissions : ajout colonnes token + amount_clt
ALTER TABLE referral_commissions
  ADD COLUMN IF NOT EXISTS token        TEXT    NOT NULL DEFAULT 'usdc',
  ADD COLUMN IF NOT EXISTS amount_clt   NUMERIC          DEFAULT NULL;

-- Commentaires
COMMENT ON COLUMN referral_commissions.token      IS 'usdc | clawdtrust — devise du pari source';
COMMENT ON COLUMN referral_commissions.amount_clt IS '5% du reserveFee en CLT (null si token = usdc)';
COMMENT ON COLUMN referral_commissions.amount_usdc IS '5% du reserveFee en USDC (null si token = clawdtrust)';

-- referral_commission_claims : solde CLT réclamable
ALTER TABLE referral_commission_claims
  ADD COLUMN IF NOT EXISTS total_clt NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN referral_commission_claims.total_clt IS 'Solde CLT réclamé dans ce claim';

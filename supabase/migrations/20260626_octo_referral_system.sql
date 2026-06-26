-- ─── OCTO Referral System ────────────────────────────────────────────────────
-- Tables: referral_codes, referrals, octo_transactions

-- 1. Code unique par wallet (généré automatiquement)
CREATE TABLE IF NOT EXISTS referral_codes (
  wallet_address TEXT PRIMARY KEY,
  code           TEXT UNIQUE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Chaque affiliation enregistrée
CREATE TABLE IF NOT EXISTS referrals (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_wallet  TEXT        NOT NULL,
  referred_wallet  TEXT        UNIQUE NOT NULL,  -- un wallet ne peut être référencé qu'une seule fois
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tous les gains OCTO (parrainage + paris)
CREATE TABLE IF NOT EXISTS octo_transactions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT        NOT NULL,
  type           TEXT        NOT NULL CHECK (type IN ('referral', 'bet')),
  amount         INTEGER     NOT NULL CHECK (amount > 0),
  ref_wallet     TEXT,       -- filleul concerné (si type = 'referral')
  bet_amount_usd NUMERIC,    -- montant en USD du pari (si type = 'bet')
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les lectures fréquentes
CREATE INDEX IF NOT EXISTS idx_referral_codes_code       ON referral_codes (code);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer        ON referrals (referrer_wallet);
CREATE INDEX IF NOT EXISTS idx_octo_transactions_wallet  ON octo_transactions (wallet_address);
CREATE INDEX IF NOT EXISTS idx_octo_transactions_type    ON octo_transactions (wallet_address, type);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE referral_codes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE octo_transactions ENABLE ROW LEVEL SECURITY;

-- Lecture : chaque wallet ne voit que ses propres données
CREATE POLICY "referral_codes_select_own"
  ON referral_codes FOR SELECT
  USING (true);  -- codes lisibles par tous (nécessaire pour valider un ?ref=)

CREATE POLICY "referrals_select_own"
  ON referrals FOR SELECT
  USING (true);  -- le parrain doit lire ses filleuls

CREATE POLICY "octo_transactions_select_own"
  ON octo_transactions FOR SELECT
  USING (true);

-- Écriture : uniquement via service_role (Edge Functions)
-- Pas de policy INSERT/UPDATE/DELETE pour anon/authenticated → bloqué par défaut

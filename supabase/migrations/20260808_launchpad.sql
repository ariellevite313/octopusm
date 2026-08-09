-- ============================================================
-- LAUNCHPAD SOLANA — Meteora DBC
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. RÉSERVATIONS DE NOM + TICKER
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_reservations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  text        NOT NULL,
  name            text        NOT NULL,
  ticker          text        NOT NULL,
  paid_sol        numeric     NOT NULL DEFAULT 0.05,
  tx_signature    text,                          -- preuve de paiement on-chain
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  consumed        boolean     NOT NULL DEFAULT false,  -- true quand le token est créé
  created_at      timestamptz NOT NULL DEFAULT now()
  -- Pas de UNIQUE ici : une réservation expirée doit libérer le nom/ticker.
  -- L'unicité est vérifiée en application : WHERE NOT consumed AND expires_at > now()
);

-- Index pour expiration + lookup wallet
CREATE INDEX idx_reservations_wallet   ON token_reservations (wallet_address);
CREATE INDEX idx_reservations_expires  ON token_reservations (expires_at) WHERE NOT consumed;

-- ────────────────────────────────────────────────────────────
-- 2. TOKENS LANCÉS VIA LE LAUNCHPAD
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS launchpad_tokens (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identité
  name                text        NOT NULL UNIQUE,
  ticker              text        NOT NULL UNIQUE,
  category            text        NOT NULL CHECK (category IN ('Meme','Utility','AI','Gaming','DeFi','NFT','x402')),
  description         text,
  logo_url            text,                      -- Cloudflare R2
  whitepaper_url      text,                      -- PDF optionnel, R2

  -- Réseaux sociaux
  website             text,
  twitter             text,
  telegram            text,
  discord             text,
  other_social        text,

  -- Solana / on-chain
  mint_address        text        UNIQUE,        -- adresse du mint (se termine par OCTO)
  pool_address        text        UNIQUE,        -- adresse du pool DBC
  creator_wallet      text        NOT NULL,
  supply              bigint      NOT NULL DEFAULT 1000000000
                        CHECK (supply >= 10000000 AND supply <= 1000000000),

  -- Configuration frais
  creator_fee_pct     numeric     NOT NULL DEFAULT 1 CHECK (creator_fee_pct IN (1, 2)),
  platform_fee_pct    numeric     NOT NULL DEFAULT 1,  -- égal à creator_fee_pct
  fee_recipients      jsonb,                     -- [{address, share_pct}] max 4 adresses
  share_top100        boolean     NOT NULL DEFAULT false,
  share_top100_pct    numeric,                   -- % des revenus créateur vers top 100

  -- Lancement programmé
  is_scheduled        boolean     NOT NULL DEFAULT false,
  scheduled_at        timestamptz,               -- null = lancement immédiat
  scheduled_paid_sol  numeric,                   -- 0.1 SOL si programmé

  -- First buy
  first_buy_amount    numeric,                   -- montant SOL que le créateur achète au mint
  first_buy_tx        text,                      -- signature tx first buy

  -- Statut
  status              text        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','active','graduating','graduated','cancelled')),
  is_tradeable        boolean     NOT NULL DEFAULT false,  -- false jusqu'à scheduled_at
  vanity_job_id       text,                      -- id du job de génération vanity address

  -- Métadonnées on-chain (Metaplex)
  metadata_uri        text,                      -- IPFS/R2 JSON uri

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX idx_launchpad_creator     ON launchpad_tokens (creator_wallet);
CREATE INDEX idx_launchpad_status      ON launchpad_tokens (status);
CREATE INDEX idx_launchpad_scheduled   ON launchpad_tokens (scheduled_at) WHERE is_scheduled AND NOT is_tradeable;
CREATE INDEX idx_launchpad_category    ON launchpad_tokens (category);

-- Updated_at auto
CREATE OR REPLACE FUNCTION update_launchpad_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_launchpad_updated_at
  BEFORE UPDATE ON launchpad_tokens
  FOR EACH ROW EXECUTE FUNCTION update_launchpad_updated_at();

-- ────────────────────────────────────────────────────────────
-- 3. NOMS PROTÉGÉS (réservés à l'admin)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS launchpad_protected_names (
  name  text PRIMARY KEY
);

INSERT INTO launchpad_protected_names (name) VALUES
  ('OM'), ('OCTO'), ('CLAWDTRUST'), ('OCTOPUS MARKET'),
  ('OCTOMARKET'), ('OMDOTFUN'), ('OMFUN'), ('BYOM'),
  ('CLAWD'), ('TRUST')
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 4. WATCHLIST "COMING SOON"
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS launchpad_watchlist (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id    uuid        NOT NULL REFERENCES launchpad_tokens (id) ON DELETE CASCADE,
  wallet      text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token_id, wallet)
);

CREATE INDEX idx_watchlist_token ON launchpad_watchlist (token_id);

-- ────────────────────────────────────────────────────────────
-- 5. RLS (Row Level Security)
-- ────────────────────────────────────────────────────────────

-- token_reservations : lecture publique, écriture via service_role uniquement
ALTER TABLE token_reservations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE launchpad_tokens         ENABLE ROW LEVEL SECURITY;
ALTER TABLE launchpad_protected_names ENABLE ROW LEVEL SECURITY;
ALTER TABLE launchpad_watchlist      ENABLE ROW LEVEL SECURITY;

-- Lecture publique des réservations (pour vérifier disponibilité nom/ticker)
CREATE POLICY "public read token_reservations"
  ON token_reservations FOR SELECT
  USING (true);

-- Lecture publique sur les tokens actifs/programmés
CREATE POLICY "public read launchpad_tokens"
  ON launchpad_tokens FOR SELECT
  USING (status IN ('active','graduating','graduated','pending'));

-- Lecture publique des noms protégés (pour validation côté client)
CREATE POLICY "public read protected names"
  ON launchpad_protected_names FOR SELECT
  USING (true);

-- Lecture publique watchlist count
CREATE POLICY "public read watchlist"
  ON launchpad_watchlist FOR SELECT
  USING (true);

-- Watchlist : un wallet peut s'ajouter/se retirer
CREATE POLICY "wallet manage own watchlist"
  ON launchpad_watchlist FOR ALL
  USING (true)
  WITH CHECK (true);

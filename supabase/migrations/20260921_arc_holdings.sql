-- ============================================================
-- ARC HOLDINGS — indexation des balances OMToken on-chain
-- ============================================================
-- arc_holdings  : balance de chaque wallet pour chaque OMToken Arc V2
-- arc_indexer_state : dernier bloc scanné par contrat (pour reprendre où on s'est arrêté)

-- ── 1. Table des balances ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS arc_holdings (
  wallet       text        NOT NULL,
  token_id     uuid        NOT NULL REFERENCES launchpad_tokens(id) ON DELETE CASCADE,
  balance_raw  text        NOT NULL DEFAULT '0',   -- uint256 stringifié (18 decimals)
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet, token_id)
);

CREATE INDEX IF NOT EXISTS idx_arc_holdings_wallet   ON arc_holdings (wallet);
CREATE INDEX IF NOT EXISTS idx_arc_holdings_token_id ON arc_holdings (token_id);
-- Index pour filtrer rapidement les soldes non nuls
CREATE INDEX IF NOT EXISTS idx_arc_holdings_nonzero  ON arc_holdings (wallet) WHERE balance_raw <> '0';

-- ── 2. État de l'indexer ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS arc_indexer_state (
  token_id     uuid        PRIMARY KEY REFERENCES launchpad_tokens(id) ON DELETE CASCADE,
  last_block   bigint      NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── 3. RLS — lecture publique, écriture service_role uniquement ───────────────

ALTER TABLE arc_holdings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_indexer_state ENABLE ROW LEVEL SECURITY;

-- Lecture publique des balances (utile pour des pages publiques de holder)
CREATE POLICY "arc_holdings_select_public"
  ON arc_holdings FOR SELECT USING (true);

-- Écriture uniquement via service_role (cron server-side)
CREATE POLICY "arc_holdings_insert_service"
  ON arc_holdings FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "arc_holdings_update_service"
  ON arc_holdings FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "arc_indexer_state_all_service"
  ON arc_indexer_state FOR ALL USING (auth.role() = 'service_role');

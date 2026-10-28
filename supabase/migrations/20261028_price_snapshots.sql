-- Historique de prix propre aux tokens : sert de secours quand GeckoTerminal / DexScreener
-- n'indexent pas encore un token (graphique + mini-courbes), et garde le dernier prix connu.
CREATE TABLE IF NOT EXISTS token_price_snapshots (
  id             bigserial   PRIMARY KEY,
  token_id       uuid        NOT NULL REFERENCES launchpad_tokens(id) ON DELETE CASCADE,
  price_usd      numeric     NOT NULL,
  market_cap_usd numeric,
  volume_24h_usd numeric,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_token_time
  ON token_price_snapshots (token_id, created_at DESC);

-- Lecture et écriture réservées au service (l'API publique passe par le serveur)
ALTER TABLE token_price_snapshots ENABLE ROW LEVEL SECURITY;

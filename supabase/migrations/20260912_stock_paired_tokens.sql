-- Stock-paired meme tokens support
-- Ajoute quote_asset + stock_symbol pour les tokens de type "Memes × Stocks"

ALTER TABLE launchpad_tokens
  ADD COLUMN IF NOT EXISTS quote_asset   text,   -- adresse ERC-20 du quote asset (xNVDA, xTSLA…)
  ADD COLUMN IF NOT EXISTS stock_symbol  text;   -- ticker du stock sous-jacent (NVDA, TSLA…)

-- Index pour filtrer rapidement par type de token
CREATE INDEX IF NOT EXISTS idx_launchpad_stock_symbol ON launchpad_tokens (stock_symbol)
  WHERE stock_symbol IS NOT NULL;

COMMENT ON COLUMN launchpad_tokens.quote_asset  IS 'Adresse ERC-20 du quote asset (null = USDC par défaut)';
COMMENT ON COLUMN launchpad_tokens.stock_symbol IS 'Ticker du stock sous-jacent (null = token USDC classique)';

-- Arc EVM chain columns for launchpad_tokens
-- Ajoutées pour supporter la création de tokens via Arc Testnet (EVM)

ALTER TABLE launchpad_tokens
  ADD COLUMN IF NOT EXISTS chain              text NOT NULL DEFAULT 'solana'
                                               CHECK (chain IN ('solana', 'arc')),
  ADD COLUMN IF NOT EXISTS arc_token_address  text UNIQUE,   -- adresse ERC-20 du token Arc
  ADD COLUMN IF NOT EXISTS arc_launch_id      text,          -- id du launch dans le contrat Launchpad
  ADD COLUMN IF NOT EXISTS arc_tx_hash        text;          -- hash de la tx create() Arc

CREATE INDEX IF NOT EXISTS idx_launchpad_chain ON launchpad_tokens (chain);

-- Créateur vérifié sur la chaîne (Solana : pool DBC, Arc : factory).
-- Les tokens existants restent à false jusqu'à une vérification (candidature hackathon, script admin).
ALTER TABLE launchpad_tokens
  ADD COLUMN IF NOT EXISTS creator_verified    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS creator_verified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_launchpad_creator_verified ON launchpad_tokens (creator_verified) WHERE creator_verified;

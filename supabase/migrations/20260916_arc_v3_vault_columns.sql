-- Migration #49 — Colonnes V3LPVault + FeeDistributor pour les tokens Arc gradués
-- Ajoutées à launchpad_tokens pour tracker les contrats déployés par LaunchpadFactory.

ALTER TABLE launchpad_tokens
  ADD COLUMN IF NOT EXISTS vault_address        text,
  ADD COLUMN IF NOT EXISTS fee_distributor_address text,
  ADD COLUMN IF NOT EXISTS holder_rewards       boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN launchpad_tokens.vault_address IS
  'Adresse du V3LPVault déployé par LaunchpadFactory (Arc uniquement). '
  'Non-null dès la création du token. Utilisé pour collecter les fees V3 post-graduation.';

COMMENT ON COLUMN launchpad_tokens.fee_distributor_address IS
  'Adresse du FeeDistributor déployé par LaunchpadFactory (Arc, holder_rewards=true). '
  'Null si le créateur n''a pas activé holder rewards.';

COMMENT ON COLUMN launchpad_tokens.holder_rewards IS
  'True si le créateur a activé la distribution des fees aux stakers (Arc uniquement). '
  'La part créateur (33% post-grad, 50% pré-grad) va au FeeDistributor au lieu du créateur.';

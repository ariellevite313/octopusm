-- Add columns to persist the ephemeral DBC config keypair for xStock pools.
-- These allow TX B (createConfig) to be rebuilt on retry if it fails mid-flight.

ALTER TABLE launchpad_tokens
  ADD COLUMN IF NOT EXISTS dbc_config_secret  text,
  ADD COLUMN IF NOT EXISTS dbc_config_address text;

COMMENT ON COLUMN launchpad_tokens.dbc_config_secret  IS
  'Base64-encoded ephemeral DBC config keypair secret key (xStock pools only). '
  'Stored so TX B can be re-signed if it fails and needs to be retried.';

COMMENT ON COLUMN launchpad_tokens.dbc_config_address IS
  'On-chain DBC config public key (xStock pools only). '
  'If non-null and account exists on-chain, TX B can be skipped on retry.';

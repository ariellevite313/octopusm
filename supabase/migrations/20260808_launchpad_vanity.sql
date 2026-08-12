-- Add vanity secret key column to launchpad_tokens.
-- This stores the base64-encoded (Buffer.toString("base64")) 64-byte Ed25519 private key
-- of the mint keypair ONLY while the pool creation transaction is pending.
-- It is set to NULL immediately after the on-chain transaction is confirmed.
-- Never exposed to clients — only read server-side via service_role.

ALTER TABLE launchpad_tokens
  ADD COLUMN IF NOT EXISTS vanity_secret_key text;

-- RLS: vanity_secret_key must never be readable via the public API.
-- The existing SELECT policy does not restrict columns, so we revoke
-- direct select and enforce server-side reads via service_role only.
-- (service_role bypasses RLS by design in Supabase.)

COMMENT ON COLUMN launchpad_tokens.vanity_secret_key IS
  'Temporary base64-encoded (Buffer.toString("base64")) 64-byte Ed25519 mint keypair. Cleared after on-chain confirmation. NEVER expose to clients.';

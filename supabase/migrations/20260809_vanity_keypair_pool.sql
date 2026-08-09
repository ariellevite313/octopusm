-- Pool of pre-generated vanity keypairs (public keys ending in "OCTO").
-- Keys are claimed atomically at token creation time — no real-time generation.

CREATE TABLE IF NOT EXISTS vanity_keypair_pool (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  public_key        text        NOT NULL UNIQUE,
  secret_key        text,                             -- bs58; cleared after on-chain confirm
  suffix            text        NOT NULL DEFAULT 'OCTO',
  assigned_token_id uuid        REFERENCES launchpad_tokens(id) ON DELETE SET NULL,
  assigned_at       timestamptz,
  created_at        timestamptz DEFAULT now() NOT NULL
);

-- Fast claim: partial index on unassigned rows only
CREATE INDEX IF NOT EXISTS idx_vanity_pool_available
  ON vanity_keypair_pool (created_at ASC)
  WHERE assigned_token_id IS NULL;

-- RLS: only service_role can read/write (bypasses RLS by default in Supabase)
ALTER TABLE vanity_keypair_pool ENABLE ROW LEVEL SECURITY;
-- No public policies — service_role only

COMMENT ON TABLE vanity_keypair_pool IS
  'Pre-generated Solana keypairs whose base58 public key ends with a platform suffix (e.g. OCTO). '
  'Claimed atomically at token-creation time. secret_key is cleared after the DBC pool is confirmed on-chain.';

-- ─── Atomic claim function ────────────────────────────────────────────────────
-- Picks the oldest unassigned keypair, marks it as assigned, and returns it.
-- Uses FOR UPDATE SKIP LOCKED to handle concurrent requests without blocking.

CREATE OR REPLACE FUNCTION claim_vanity_keypair(p_token_id uuid)
RETURNS TABLE (pool_id uuid, pub_key text, sec_key text)
LANGUAGE sql
SECURITY DEFINER  -- runs as superuser to bypass RLS
AS $$
  UPDATE vanity_keypair_pool
  SET
    assigned_token_id = p_token_id,
    assigned_at       = now()
  WHERE id = (
    SELECT id
    FROM   vanity_keypair_pool
    WHERE  assigned_token_id IS NULL
    ORDER  BY created_at ASC
    LIMIT  1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id, public_key, secret_key;
$$;

-- ─── Release function (used on rollback if token insert fails) ────────────────
CREATE OR REPLACE FUNCTION release_vanity_keypair(p_pool_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE vanity_keypair_pool
  SET assigned_token_id = NULL, assigned_at = NULL
  WHERE id = p_pool_id;
$$;

-- ─── Release by token (used when admin retries vanity) ───────────────────────
-- IMPORTANT: do NOT clear secret_key here — the keypair re-enters the pool
-- and its secret_key must be intact when the next token claims it.
-- secret_key is only cleared by clear_vanity_secret() after on-chain confirm.
CREATE OR REPLACE FUNCTION release_vanity_keypair_by_token(p_token_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE vanity_keypair_pool
  SET assigned_token_id = NULL, assigned_at = NULL
  WHERE assigned_token_id = p_token_id;
$$;

-- ─── Clear secret after confirmation ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION clear_vanity_secret(p_token_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE vanity_keypair_pool
  SET secret_key = NULL
  WHERE assigned_token_id = p_token_id;
$$;

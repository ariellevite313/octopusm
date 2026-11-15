-- DSOL-20 : lancements Solana en paire DOGE. Les adresses commencent par « DoGE » et viennent de la réserve
-- vanity_keypair_pool (colonne suffix = « DoGE »), remplie avec scripts/import-vanity-keys.mjs.

-- Prend une clé de la réserve pour un motif donné (ne mélange pas les réserves « om » et « DoGE »)
CREATE OR REPLACE FUNCTION claim_vanity_keypair_label(p_token_id uuid, p_label text)
RETURNS TABLE (pool_id uuid, pub_key text, sec_key text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE vanity_keypair_pool
  SET assigned_token_id = p_token_id, assigned_at = now()
  WHERE id = (
    SELECT id FROM vanity_keypair_pool
    WHERE assigned_token_id IS NULL AND suffix = p_label AND secret_key IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id, public_key, secret_key;
$$;
REVOKE ALL ON FUNCTION claim_vanity_keypair_label(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_vanity_pool_label_available ON vanity_keypair_pool (suffix, created_at) WHERE assigned_token_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_launchpad_tokens_quote ON launchpad_tokens (quote_asset) WHERE quote_asset IS NOT NULL;

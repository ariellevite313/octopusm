-- Indexer DRC-20 : rôle limité au lieu de la clé service_role (qui donnait accès à toute la base).
-- Le rôle peut seulement lire les tables DRC-20 et appeler drc20_commit_block. Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'drc20_indexer') THEN
    CREATE ROLE drc20_indexer NOLOGIN NOINHERIT;
  END IF;
END $$;

-- PostgREST passe à ce rôle quand le jeton porte « role: drc20_indexer »
GRANT drc20_indexer TO authenticator;
GRANT USAGE ON SCHEMA public TO drc20_indexer;
GRANT SELECT ON public.drc20_tokens, public.drc20_balances, public.drc20_pending, public.drc20_state TO drc20_indexer;
GRANT EXECUTE ON FUNCTION public.drc20_commit_block(integer, text, jsonb, jsonb, jsonb, jsonb, jsonb) TO drc20_indexer;

-- drc20_pending n'a pas de lecture publique : lecture réservée à l'indexer
DROP POLICY IF EXISTS drc20_pending_indexer_read ON public.drc20_pending;
CREATE POLICY drc20_pending_indexer_read ON public.drc20_pending FOR SELECT TO drc20_indexer USING (true);

-- Sécurité, lot 1 (audit du 18/11/2026)
-- Ces fonctions SECURITY DEFINER étaient appelables par n'importe qui avec la clé anon publique.
-- Toutes sont appelées uniquement par le serveur (client admin / service_role), donc on ferme l'accès au public.
-- Idempotent : peut être relancé sans risque.

-- 1. Réserve de clés vanity : lecture des clés privées, libération et effacement de la clé d'un autre token
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.claim_vanity_keypair(uuid)',
    'public.release_vanity_keypair(uuid)',
    'public.release_vanity_keypair_by_token(uuid)',
    'public.clear_vanity_secret(uuid)',
    -- 2. Compteurs des pools de paris : gonflables par n'importe qui, ce qui faussait les gains
    'public.increment_pool_total(uuid, text, numeric)',
    'public.increment_updown_pool(uuid, text, numeric)',
    -- Fonction de trigger : n'a jamais besoin d'être appelée directement
    'public.ambassador_welcome()'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', f);
    END IF;
  END LOOP;
END $$;

-- 3. Compteurs : refuser les montants nuls ou négatifs, même côté serveur
CREATE OR REPLACE FUNCTION public.increment_pool_total(p_market_id uuid, p_token text, p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  IF p_token = 'usdc' THEN
    UPDATE mutuel_markets SET total_pool_usdc = total_pool_usdc + p_amount, bet_count = bet_count + 1 WHERE id = p_market_id;
  ELSE
    UPDATE mutuel_markets SET total_pool_clt = total_pool_clt + p_amount, bet_count = bet_count + 1 WHERE id = p_market_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.increment_updown_pool(p_market_id uuid, p_column text, p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  IF p_column = 'pool_up' THEN
    UPDATE updown_markets SET pool_up = COALESCE(pool_up, 0) + p_amount WHERE id = p_market_id;
  ELSIF p_column = 'pool_down' THEN
    UPDATE updown_markets SET pool_down = COALESCE(pool_down, 0) + p_amount WHERE id = p_market_id;
  ELSE
    RAISE EXCEPTION 'Invalid column: %', p_column;
  END IF;
END $$;

-- CREATE OR REPLACE garde les droits existants, on les réaffirme quand même
REVOKE ALL ON FUNCTION public.increment_pool_total(uuid, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_updown_pool(uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_pool_total(uuid, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_updown_pool(uuid, text, numeric) TO service_role;

-- 4. Table de la réserve vanity : aucun accès direct hors serveur
ALTER TABLE IF EXISTS public.vanity_keypair_pool ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vanity_keypair_pool FROM PUBLIC, anon, authenticated;

-- 5. Watchlist : l'écriture passe par le serveur, la politique « tout le monde écrit tout » est supprimée
DROP POLICY IF EXISTS "wallet manage own watchlist" ON public.launchpad_watchlist;

-- 6. Un paiement on-chain ne sert qu'une fois, tous flux confondus (pool, marché, up/down, création de pool).
--    Avant : l'unicité n'existait que table par table, donc une même transaction pouvait payer deux paris.
CREATE TABLE IF NOT EXISTS public.used_payments (
  chain      text NOT NULL,
  tx_id      text NOT NULL,
  flow       text NOT NULL,
  wallet     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain, tx_id)
);
ALTER TABLE public.used_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.used_payments FROM PUBLIC, anon, authenticated;

-- Reprise de l'existant : les transactions déjà enregistrées ne peuvent plus resservir
INSERT INTO public.used_payments (chain, tx_id, flow)
  SELECT CASE WHEN tx_signature LIKE '0x%' THEN 'arc' ELSE 'solana' END, lower_if_evm, 'payments'
  FROM (SELECT tx_signature, CASE WHEN tx_signature LIKE '0x%' THEN lower(tx_signature) ELSE tx_signature END AS lower_if_evm FROM public.payments WHERE tx_signature IS NOT NULL) p
ON CONFLICT DO NOTHING;
INSERT INTO public.used_payments (chain, tx_id, flow)
  SELECT CASE WHEN tx_signature LIKE '0x%' THEN 'arc' ELSE 'solana' END, CASE WHEN tx_signature LIKE '0x%' THEN lower(tx_signature) ELSE tx_signature END, 'updown'
  FROM public.updown_bets WHERE tx_signature IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO public.used_payments (chain, tx_id, flow)
  SELECT CASE WHEN creation_tx LIKE '0x%' THEN 'arc' ELSE 'solana' END, CASE WHEN creation_tx LIKE '0x%' THEN lower(creation_tx) ELSE creation_tx END, 'pool_creation'
  FROM public.mutuel_markets WHERE creation_tx IS NOT NULL
ON CONFLICT DO NOTHING;

-- 7. Signatures à usage unique (actions d'agents MCP, candidature hackathon) : registre durable, partagé entre serveurs.
--    Avant : une simple liste en mémoire, perdue au redémarrage et contournable en réencodant la signature.
CREATE TABLE IF NOT EXISTS public.used_signatures (
  key        text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.used_signatures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.used_signatures FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_used_signatures_created ON public.used_signatures (created_at);

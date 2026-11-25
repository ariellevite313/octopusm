-- Profils : animations débloquables (contour animé de l'avatar, mascottes Omero sur la bannière).
-- Certaines se débloquent avec le niveau Omero, d'autres s'achètent en Omero (crédités au compte de l'admin).
-- Acheter une animation baisse le solde Omero, pas le classement (le niveau ne descend pas).
-- Idempotent : peut être relancé sans risque.

ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS profile_frame text;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS profile_buddies boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.profile_cosmetics (
  wallet     text        NOT NULL,
  item       text        NOT NULL,
  cost       integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet, item)
);
ALTER TABLE public.profile_cosmetics ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.octo_transactions DROP CONSTRAINT IF EXISTS octo_transactions_type_check;
ALTER TABLE public.octo_transactions ADD CONSTRAINT octo_transactions_type_check
  CHECK (type IN ('bet', 'task', 'referral', 'launch', 'swap', 'tip', 'tip_sent', 'community', 'welcome', 'boost', 'cosmetic'));

-- Achat d'une animation : vérifie le solde, débite, crédite l'admin, enregistre l'achat. Tout ou rien.
CREATE OR REPLACE FUNCTION public.buy_profile_item(p_wallet text, p_item text, p_cost integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance numeric;
  v_admin   text;
BEGIN
  IF p_cost <= 0 THEN RETURN jsonb_build_object('error', 'invalid'); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('profile_item:' || lower(p_wallet)));
  IF EXISTS (SELECT 1 FROM profile_cosmetics WHERE same_wallet(wallet, p_wallet) AND item = p_item) THEN
    RETURN jsonb_build_object('error', 'owned');
  END IF;
  SELECT coalesce(sum(amount), 0) INTO v_balance FROM octo_transactions WHERE same_wallet(wallet_address, p_wallet);
  IF v_balance < p_cost THEN RETURN jsonb_build_object('error', 'insufficient_balance'); END IF;

  INSERT INTO octo_transactions (wallet_address, type, amount, label) VALUES (p_wallet, 'cosmetic', -p_cost, 'cosmetic:' || p_item);
  INSERT INTO profile_cosmetics (wallet, item, cost) VALUES (p_wallet, p_item, p_cost);

  SELECT address INTO v_admin FROM wallets WHERE role = 'admin' ORDER BY created_at ASC NULLS LAST LIMIT 1;
  IF v_admin IS NOT NULL AND NOT same_wallet(v_admin, p_wallet) THEN
    INSERT INTO octo_transactions (wallet_address, type, amount, label) VALUES (v_admin, 'cosmetic', p_cost, 'cosmetic_in:' || p_item);
  END IF;
  RETURN jsonb_build_object('ok', true, 'balance', v_balance - p_cost);
END $$;
REVOKE ALL ON FUNCTION public.buy_profile_item(text, text, integer) FROM public, anon, authenticated;

-- Nombre de personnes par niveau (leaderboard_octo.total_octo), en une seule requête.
CREATE OR REPLACE FUNCTION public.octo_level_counts()
RETURNS TABLE (blue bigint, green bigint, yellow bigint, orange bigint, red bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    count(*) FILTER (WHERE total_octo >= 1000  AND total_octo <= 5000),
    count(*) FILTER (WHERE total_octo >  5000  AND total_octo <= 10000),
    count(*) FILTER (WHERE total_octo >  10000 AND total_octo <= 20000),
    count(*) FILTER (WHERE total_octo >  20000 AND total_octo <= 50000),
    count(*) FILTER (WHERE total_octo >  50000)
  FROM leaderboard_octo;
$$;
REVOKE ALL ON FUNCTION public.octo_level_counts() FROM public, anon, authenticated;

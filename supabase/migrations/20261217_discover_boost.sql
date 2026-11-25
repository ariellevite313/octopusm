-- Discover : mise en avant payée en Omero (et seulement en Omero). Seules les fiches boostées apparaissent dans « Recommandés ».
-- Hackathon : lien optionnel vers la fiche Discover du projet.
-- Idempotent : peut être relancé sans risque.

ALTER TABLE public.discover_apps ADD COLUMN IF NOT EXISTS boosted_until timestamptz;
CREATE INDEX IF NOT EXISTS idx_discover_apps_boost ON public.discover_apps (boosted_until DESC) WHERE boosted_until IS NOT NULL;

ALTER TABLE public.hackathon_projects ADD COLUMN IF NOT EXISTS discover_url text;

ALTER TABLE public.octo_transactions DROP CONSTRAINT IF EXISTS octo_transactions_type_check;
ALTER TABLE public.octo_transactions ADD CONSTRAINT octo_transactions_type_check
  CHECK (type IN ('bet', 'task', 'referral', 'launch', 'swap', 'tip', 'tip_sent', 'community', 'welcome', 'boost'));

-- Boost : vérifie le propriétaire et le solde, débite les Omero, prolonge la mise en avant. Tout ou rien.
CREATE OR REPLACE FUNCTION public.boost_discover_app(p_wallet text, p_app uuid, p_cost integer, p_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner   text;
  v_status  text;
  v_balance numeric;
  v_until   timestamptz;
  v_lb      text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('discover_boost:' || lower(p_wallet)));
  SELECT owner, status INTO v_owner, v_status FROM discover_apps WHERE id = p_app FOR UPDATE;
  IF v_owner IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF NOT same_wallet(v_owner, p_wallet) THEN RETURN jsonb_build_object('error', 'not_owner'); END IF;
  IF v_status <> 'live' THEN RETURN jsonb_build_object('error', 'hidden'); END IF;
  SELECT coalesce(sum(amount), 0) INTO v_balance FROM octo_transactions WHERE same_wallet(wallet_address, p_wallet);
  IF v_balance < p_cost THEN RETURN jsonb_build_object('error', 'insufficient_balance'); END IF;

  UPDATE discover_apps SET boosted_until = greatest(coalesce(boosted_until, now()), now()) + make_interval(days => p_days)
  WHERE id = p_app RETURNING boosted_until INTO v_until;
  INSERT INTO octo_transactions (wallet_address, type, amount, label) VALUES (p_wallet, 'boost', -p_cost, 'boost:' || p_app);
  SELECT wallet_address INTO v_lb FROM leaderboard_octo WHERE same_wallet(wallet_address, p_wallet) ORDER BY total_octo DESC LIMIT 1;
  PERFORM add_leaderboard_octo(coalesce(v_lb, p_wallet), -p_cost);
  RETURN jsonb_build_object('ok', true, 'until', v_until, 'balance', v_balance - p_cost);
END $$;
REVOKE ALL ON FUNCTION public.boost_discover_app(text, uuid, integer, integer) FROM public, anon, authenticated;

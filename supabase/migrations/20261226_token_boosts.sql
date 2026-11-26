-- Boost de tokens (Omero uniquement) : n'importe quel token du Terminal peut être mis dans « Tokens en tendance » du fil.
-- Tout le monde peut booster n'importe quel token, volontairement. Les Omero payés vont sur le compte Omero de l'admin.
-- Idempotent.
CREATE TABLE IF NOT EXISTS public.token_boosts (
  chain         text NOT NULL,
  mint          text NOT NULL,
  symbol        text NOT NULL,
  name          text NOT NULL,
  logo          text,
  boosted_until timestamptz NOT NULL,
  last_wallet   text NOT NULL,
  boosts        integer NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain, mint)
);
CREATE INDEX IF NOT EXISTS idx_token_boosts_until ON public.token_boosts (boosted_until DESC);
ALTER TABLE public.token_boosts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.boost_token(
  p_wallet text, p_chain text, p_mint text, p_symbol text, p_name text, p_logo text, p_cost integer, p_hours integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance numeric;
  v_until   timestamptz;
  v_lb      text;
  v_admin   text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('token_boost:' || lower(p_wallet)));
  SELECT coalesce(sum(amount), 0) INTO v_balance FROM octo_transactions WHERE same_wallet(wallet_address, p_wallet);
  IF v_balance < p_cost THEN RETURN jsonb_build_object('error', 'insufficient_balance'); END IF;

  -- Un boost s'ajoute au temps restant d'un boost en cours
  INSERT INTO token_boosts (chain, mint, symbol, name, logo, boosted_until, last_wallet, boosts, updated_at)
  VALUES (p_chain, p_mint, p_symbol, p_name, p_logo, now() + make_interval(hours => p_hours), p_wallet, 1, now())
  ON CONFLICT (chain, mint) DO UPDATE SET
    boosted_until = greatest(token_boosts.boosted_until, now()) + make_interval(hours => p_hours),
    symbol = excluded.symbol, name = excluded.name, logo = excluded.logo,
    last_wallet = excluded.last_wallet, boosts = token_boosts.boosts + 1, updated_at = now()
  RETURNING boosted_until INTO v_until;

  INSERT INTO octo_transactions (wallet_address, type, amount, label) VALUES (p_wallet, 'boost', -p_cost, 'token_boost:' || p_chain || ':' || p_mint);
  SELECT wallet_address INTO v_lb FROM leaderboard_octo WHERE same_wallet(wallet_address, p_wallet) ORDER BY total_octo DESC LIMIT 1;
  PERFORM add_leaderboard_octo(coalesce(v_lb, p_wallet), -p_cost);

  SELECT address INTO v_admin FROM wallets WHERE role = 'admin' ORDER BY created_at ASC NULLS LAST LIMIT 1;
  IF v_admin IS NOT NULL AND NOT same_wallet(v_admin, p_wallet) THEN
    INSERT INTO octo_transactions (wallet_address, type, amount, label) VALUES (v_admin, 'boost', p_cost, 'token_boost_in:' || p_chain || ':' || p_mint);
  END IF;

  RETURN jsonb_build_object('ok', true, 'until', v_until, 'balance', v_balance - p_cost);
END $$;
REVOKE ALL ON FUNCTION public.boost_token(text, text, text, text, text, text, integer, integer) FROM public, anon, authenticated;

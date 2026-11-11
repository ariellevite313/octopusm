-- Tips en OMERO sur les posts du fil.
-- Tout passe par send_post_tip (service role uniquement) : vérifications, solde et écritures dans une seule transaction,
-- sous un verrou par envoyeur. Impossible de dépenser deux fois le même solde ou d'envoyer plus que ce qu'on a.

-- 1. Types de mouvements OMERO
ALTER TABLE public.octo_transactions DROP CONSTRAINT IF EXISTS octo_transactions_type_check;
ALTER TABLE public.octo_transactions ADD CONSTRAINT octo_transactions_type_check
  CHECK (type IN ('bet', 'task', 'referral', 'launch', 'swap', 'tip', 'tip_sent'));

-- 2. Notification « X t'a envoyé des OMERO »
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('follow', 'mention', 'reply', 'like', 'repost', 'quote', 'reply_like', 'reply_reply', 'tip'));

-- 3. Journal des tips
CREATE TABLE IF NOT EXISTS public.post_tips (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  sender     text NOT NULL,
  recipient  text NOT NULL,
  amount     integer NOT NULL CHECK (amount > 0),
  currency   text NOT NULL DEFAULT 'omero' CHECK (currency IN ('omero')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender <> recipient)
);
CREATE INDEX IF NOT EXISTS idx_post_tips_post ON public.post_tips (post_id);
CREATE INDEX IF NOT EXISTS idx_post_tips_sender ON public.post_tips (sender, created_at DESC);
ALTER TABLE public.post_tips ENABLE ROW LEVEL SECURITY;
-- Aucune politique : lecture et écriture uniquement par le serveur (service role).

-- 4. Le classement OMERO est mis à jour de façon atomique (plus de lecture puis écriture)
CREATE OR REPLACE FUNCTION public.add_leaderboard_octo(p_wallet text, p_amount numeric)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.leaderboard_octo (wallet_address, total_octo) VALUES (p_wallet, p_amount)
  ON CONFLICT (wallet_address) DO UPDATE SET total_octo = public.leaderboard_octo.total_octo + p_amount, updated_at = now();
$$;
REVOKE ALL ON FUNCTION public.add_leaderboard_octo(text, numeric) FROM public, anon, authenticated;

-- Compare deux wallets : sans tenir compte des majuscules pour les adresses 0x, à l'identique pour Solana.
CREATE OR REPLACE FUNCTION public.same_wallet(a text, b text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN a ~* '^0x[0-9a-f]{40}$' THEN lower(a) = lower(b) ELSE a = b END;
$$;

-- 5. Envoi d'un tip. Renvoie {ok:true, post_total, balance} ou {error:'code'}.
CREATE OR REPLACE FUNCTION public.send_post_tip(
  p_sender text, p_post uuid, p_amount integer,
  p_min_age_days integer DEFAULT 30, p_hourly_max integer DEFAULT 30, p_daily_cap integer DEFAULT 500
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_author    text;
  v_first     timestamptz;
  v_active    boolean;
  v_hour      integer;
  v_day       bigint;
  v_balance   numeric;
  v_tip_id    uuid;
  v_total     bigint;
  v_lb_sender text;
  v_lb_author text;
BEGIN
  IF p_sender IS NULL OR p_sender = '' THEN RETURN jsonb_build_object('error', 'not_authenticated'); END IF;
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > p_daily_cap THEN RETURN jsonb_build_object('error', 'invalid_amount'); END IF;

  -- Un envoi à la fois par envoyeur : les clics simultanés attendent leur tour et voient le solde à jour.
  PERFORM pg_advisory_xact_lock(hashtext('omero_tip:' || lower(p_sender)));

  SELECT author INTO v_author FROM public.posts WHERE id = p_post AND NOT hidden;
  IF v_author IS NULL THEN RETURN jsonb_build_object('error', 'post_not_found'); END IF;
  IF public.same_wallet(v_author, p_sender) THEN RETURN jsonb_build_object('error', 'self_tip'); END IF;

  -- Ancienneté : la plus ancienne trace du compte (inscription, premier mouvement OMERO, premier post).
  SELECT least(
    (SELECT min(created_at) FROM auth.users
       WHERE public.same_wallet(raw_app_meta_data->>'wallet_address', p_sender)
          OR email = lower(p_sender) || '@octopus-market.wallet'),
    (SELECT min(created_at) FROM public.octo_transactions WHERE public.same_wallet(wallet_address, p_sender)),
    (SELECT min(created_at) FROM public.posts WHERE public.same_wallet(author, p_sender))
  ) INTO v_first;
  IF v_first IS NULL OR v_first > now() - make_interval(days => p_min_age_days) THEN
    RETURN jsonb_build_object('error', 'account_too_new');
  END IF;

  -- Activité réelle : un marché validé par l'admin, ou un token réellement lancé.
  SELECT EXISTS (
    SELECT 1 FROM public.mutuel_markets
     WHERE public.same_wallet(creator_wallet, p_sender) AND status IN ('active', 'closed', 'resolved')
  ) OR EXISTS (
    SELECT 1 FROM public.launchpad_tokens
     WHERE public.same_wallet(creator_wallet, p_sender) AND status IN ('active', 'graduating', 'graduated')
  ) INTO v_active;
  IF NOT v_active THEN RETURN jsonb_build_object('error', 'no_activity'); END IF;

  -- Limites anti-abus
  SELECT count(*), coalesce(sum(amount), 0) INTO v_hour, v_day FROM public.post_tips
   WHERE public.same_wallet(sender, p_sender) AND created_at > now() - interval '1 hour';
  IF v_hour >= p_hourly_max THEN RETURN jsonb_build_object('error', 'rate_limited'); END IF;
  SELECT coalesce(sum(amount), 0) INTO v_day FROM public.post_tips
   WHERE public.same_wallet(sender, p_sender) AND created_at > now() - interval '24 hours';
  IF v_day + p_amount > p_daily_cap THEN RETURN jsonb_build_object('error', 'daily_cap'); END IF;

  -- Solde réel = somme de tous les mouvements OMERO
  SELECT coalesce(sum(amount), 0) INTO v_balance FROM public.octo_transactions WHERE public.same_wallet(wallet_address, p_sender);
  IF v_balance < p_amount THEN RETURN jsonb_build_object('error', 'insufficient_balance'); END IF;

  INSERT INTO public.post_tips (post_id, sender, recipient, amount) VALUES (p_post, p_sender, v_author, p_amount)
  RETURNING id INTO v_tip_id;
  INSERT INTO public.octo_transactions (wallet_address, type, amount, label) VALUES
    (p_sender, 'tip_sent', -p_amount, 'tip:' || v_tip_id),
    (v_author, 'tip',       p_amount, 'tip:' || v_tip_id);
  -- Classement : on met à jour la ligne existante du wallet (quelle que soit la casse d'une adresse 0x).
  SELECT wallet_address INTO v_lb_sender FROM public.leaderboard_octo WHERE public.same_wallet(wallet_address, p_sender) ORDER BY total_octo DESC LIMIT 1;
  SELECT wallet_address INTO v_lb_author FROM public.leaderboard_octo WHERE public.same_wallet(wallet_address, v_author) ORDER BY total_octo DESC LIMIT 1;
  PERFORM public.add_leaderboard_octo(coalesce(v_lb_sender, p_sender), -p_amount);
  PERFORM public.add_leaderboard_octo(coalesce(v_lb_author, v_author), p_amount);

  SELECT coalesce(sum(amount), 0) INTO v_total FROM public.post_tips WHERE post_id = p_post;
  RETURN jsonb_build_object('ok', true, 'post_total', v_total, 'balance', v_balance - p_amount, 'recipient', v_author);
END;
$$;
REVOKE ALL ON FUNCTION public.send_post_tip(text, uuid, integer, integer, integer, integer) FROM public, anon, authenticated;

-- 6. Totaux et 3 plus gros tippeurs par post (pour le fil)
CREATE OR REPLACE FUNCTION public.post_tip_stats(p_ids uuid[])
RETURNS TABLE (post_id uuid, sender text, sender_total bigint, post_total bigint, rnk bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT t.post_id, t.sender, sum(t.amount)::bigint AS sender_total
      FROM public.post_tips t WHERE t.post_id = ANY (p_ids)
     GROUP BY t.post_id, t.sender
  ), r AS (
    SELECT s.*, sum(s.sender_total) OVER (PARTITION BY s.post_id)::bigint AS post_total,
           row_number() OVER (PARTITION BY s.post_id ORDER BY s.sender_total DESC, s.sender) AS rnk
      FROM s
  )
  SELECT post_id, sender, sender_total, post_total, rnk FROM r WHERE rnk <= 3;
$$;
REVOKE ALL ON FUNCTION public.post_tip_stats(uuid[]) FROM public, anon, authenticated;

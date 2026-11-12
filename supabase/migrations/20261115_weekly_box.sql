-- Box de la semaine : chaque activité rapporte des points (trades, posts, articles, sacs, paris, tips, lancements).
-- À la fin de la semaine (lundi 00:00 UTC), le top 10 reçoit ses points en OMERO automatiquement
-- et le premier gagne une box de 0,05 SOL qu'il réclame, puis l'équipe le paie à la main.
-- Tout le règlement passe par settle_weekly_box (service role uniquement), en une seule transaction.

-- 1. Semaines réglées et box du gagnant
CREATE TABLE IF NOT EXISTS public.weekly_box_weeks (
  week_start   date PRIMARY KEY,                 -- lundi (UTC)
  settled_at   timestamptz NOT NULL DEFAULT now(),
  winner       text,                             -- null si personne n'est éligible
  winner_points integer,
  prize_sol    numeric NOT NULL DEFAULT 0.05 CHECK (prize_sol >= 0),
  prize_status text NOT NULL DEFAULT 'none' CHECK (prize_status IN ('none', 'won', 'claimed', 'paid')),
  claimed_at   timestamptz,
  paid_at      timestamptz,
  paid_tx      text,
  paid_by      text
);

-- 2. Classement final de chaque semaine (top 10)
CREATE TABLE IF NOT EXISTS public.weekly_box_results (
  week_start date NOT NULL REFERENCES public.weekly_box_weeks (week_start) ON DELETE CASCADE,
  wallet     text NOT NULL,
  rank       integer NOT NULL CHECK (rank BETWEEN 1 AND 10),
  points     integer NOT NULL CHECK (points > 0),
  omero      integer NOT NULL CHECK (omero >= 0),
  PRIMARY KEY (week_start, wallet),
  UNIQUE (week_start, rank)
);
CREATE INDEX IF NOT EXISTS weekly_box_results_wallet_idx ON public.weekly_box_results (wallet, week_start DESC);

ALTER TABLE public.weekly_box_weeks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_box_results ENABLE ROW LEVEL SECURITY;

-- 3. Nouveau type de mouvement OMERO
ALTER TABLE public.octo_transactions DROP CONSTRAINT IF EXISTS octo_transactions_type_check;
ALTER TABLE public.octo_transactions ADD CONSTRAINT octo_transactions_type_check
  CHECK (type IN ('bet', 'task', 'referral', 'launch', 'swap', 'tip', 'tip_sent', 'weekly_box'));

-- 4. Notification « ta box de la semaine »
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('follow', 'mention', 'reply', 'like', 'repost', 'quote', 'reply_like', 'reply_reply', 'tip', 'chill', 'weekly_box'));

-- 5. Règlement atomique d'une semaine. p_rows = [{ "wallet": "...", "points": 123 }, ...] déjà triés (10 max).
--    Renvoie false si la semaine était déjà réglée (aucune écriture).
CREATE OR REPLACE FUNCTION public.settle_weekly_box(p_week date, p_rows jsonb, p_prize numeric)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row    jsonb;
  v_rank   integer := 0;
  v_wallet text;
  v_points integer;
  v_winner text;
  v_wpts   integer;
  v_lb     text;
BEGIN
  IF extract(isodow FROM p_week) <> 1 THEN RAISE EXCEPTION 'week must start on a Monday'; END IF;
  IF p_week + 7 > (now() AT TIME ZONE 'utc')::date THEN RAISE EXCEPTION 'week not finished'; END IF;
  IF jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 10 THEN RAISE EXCEPTION 'top 10 only'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('weekly_box:' || p_week::text));
  IF EXISTS (SELECT 1 FROM public.weekly_box_weeks WHERE week_start = p_week) THEN RETURN false; END IF;

  IF jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 0 THEN
    v_winner := p_rows -> 0 ->> 'wallet';
    v_wpts   := (p_rows -> 0 ->> 'points')::integer;
  END IF;

  INSERT INTO public.weekly_box_weeks (week_start, winner, winner_points, prize_sol, prize_status)
  VALUES (p_week, v_winner, v_wpts, p_prize, CASE WHEN v_winner IS NULL OR p_prize <= 0 THEN 'none' ELSE 'won' END);

  FOR v_row IN SELECT * FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) LOOP
    v_rank   := v_rank + 1;
    v_wallet := v_row ->> 'wallet';
    v_points := (v_row ->> 'points')::integer;
    IF v_wallet IS NULL OR v_points IS NULL OR v_points <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.weekly_box_results (week_start, wallet, rank, points, omero) VALUES (p_week, v_wallet, v_rank, v_points, v_points);
    -- 1 point = 1 OMERO, crédité tout de suite
    INSERT INTO public.octo_transactions (wallet_address, type, amount, label) VALUES (v_wallet, 'weekly_box', v_points, 'weekly_box:' || p_week::text);
    SELECT wallet_address INTO v_lb FROM public.leaderboard_octo WHERE public.same_wallet(wallet_address, v_wallet) ORDER BY total_octo DESC LIMIT 1;
    PERFORM public.add_leaderboard_octo(coalesce(v_lb, v_wallet), v_points);
    INSERT INTO public.notifications (wallet, kind, actor) VALUES (v_wallet, 'weekly_box', 'weekly-box:' || p_week::text)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.settle_weekly_box(date, jsonb, numeric) FROM public, anon, authenticated;

-- 6. Le gagnant réclame sa box (service role, vérifié par l'API)
CREATE OR REPLACE FUNCTION public.claim_weekly_box(p_week date, p_wallet text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_status text;
BEGIN
  UPDATE public.weekly_box_weeks SET prize_status = 'claimed', claimed_at = now()
  WHERE week_start = p_week AND prize_status = 'won' AND public.same_wallet(winner, p_wallet)
  RETURNING prize_status INTO v_status;
  IF v_status IS NULL THEN
    SELECT prize_status INTO v_status FROM public.weekly_box_weeks WHERE week_start = p_week AND public.same_wallet(winner, p_wallet);
    RETURN coalesce(v_status, 'not_winner');
  END IF;
  RETURN 'claimed';
END;
$$;
REVOKE ALL ON FUNCTION public.claim_weekly_box(date, text) FROM public, anon, authenticated;

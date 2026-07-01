-- Leaderboard OCTO
-- Source correcte : table octo_transactions (gains parrainage + paris)
-- A coller dans Supabase Dashboard -> SQL Editor

DROP VIEW IF EXISTS public.leaderboard_octo;

CREATE OR REPLACE VIEW public.leaderboard_octo AS
SELECT
  ot.wallet_address,
  COALESCE(w.username, w.display_name)  AS display_name,
  w.avatar_src,
  SUM(ot.amount)::bigint                AS total_octo,
  COUNT(*) FILTER (
    WHERE ot.type = 'bet'
  )::int                                AS win_count,
  RANK() OVER (
    ORDER BY SUM(ot.amount) DESC
  )::int                                AS rank
FROM public.octo_transactions ot
LEFT JOIN public.wallets w ON w.address = ot.wallet_address
GROUP BY
  ot.wallet_address,
  w.username,
  w.display_name,
  w.avatar_src;

GRANT SELECT ON public.leaderboard_octo TO anon, authenticated;

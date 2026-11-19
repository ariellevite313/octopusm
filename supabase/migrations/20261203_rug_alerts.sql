-- Alertes rug : notification quand un token que l'on détient perd sa liquidité, que son dev vend, ou qu'il est signalé « rugged ».
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('follow', 'mention', 'reply', 'like', 'repost', 'quote', 'reply_like', 'reply_reply', 'tip', 'chill', 'weekly_box', 'ambassador', 'price_alert', 'wallet_trade', 'rug_alert'));

-- État surveillé de chaque token détenu (liquidité, plus haut de liquidité, statut du dev)
CREATE TABLE IF NOT EXISTS public.token_watch (
  mint           text PRIMARY KEY,
  symbol         text,
  liquidity      numeric,
  peak_liquidity numeric,
  dev_status     text,
  rugged         boolean NOT NULL DEFAULT false,
  checked_at     timestamptz,
  dev_checked_at timestamptz
);
ALTER TABLE public.token_watch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.token_watch FROM PUBLIC, anon, authenticated;

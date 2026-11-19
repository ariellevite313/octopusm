-- Terminal : alertes de capitalisation et suivi de wallets, envoyés dans les notifications.
-- Idempotent : peut être relancé sans risque.

-- Notifications : référence et données libres (symbole, montant...) pour les alertes du Terminal
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS ref  text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS data jsonb;
DROP INDEX IF EXISTS uq_notifications_dedupe;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedupe ON public.notifications
  (wallet, kind, actor, coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(ref, ''));
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('follow', 'mention', 'reply', 'like', 'repost', 'quote', 'reply_like', 'reply_reply', 'tip', 'chill', 'weekly_box', 'ambassador', 'price_alert', 'wallet_trade'));

-- Alertes de capitalisation : « préviens-moi quand ce token passe au-dessus / en dessous de X $ »
CREATE TABLE IF NOT EXISTS public.terminal_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet       text NOT NULL,
  chain        text NOT NULL DEFAULT 'solana',
  mint         text NOT NULL,
  symbol       text,
  kind         text NOT NULL CHECK (kind IN ('mcap_above', 'mcap_below')),
  value        numeric NOT NULL CHECK (value > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  triggered_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_terminal_alerts_active ON public.terminal_alerts (chain, mint) WHERE triggered_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_terminal_alerts_wallet ON public.terminal_alerts (wallet, created_at DESC);
ALTER TABLE public.terminal_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.terminal_alerts FROM PUBLIC, anon, authenticated;

-- Wallets suivis : notification quand ils achètent ou vendent un token (Solana)
CREATE TABLE IF NOT EXISTS public.tracked_wallets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner           text NOT NULL,
  address         text NOT NULL,
  label           text,
  last_sig        text,
  last_checked_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner, address)
);
CREATE INDEX IF NOT EXISTS idx_tracked_wallets_check ON public.tracked_wallets (last_checked_at NULLS FIRST);
ALTER TABLE public.tracked_wallets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tracked_wallets FROM PUBLIC, anon, authenticated;

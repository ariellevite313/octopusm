-- Parrainage, phase 3 : notifications de gains (à chaque gain + récap de la semaine) et index pour le tableau de bord et le classement.
-- Idempotent : peut être relancé sans risque. Ne change aucun taux.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('follow', 'mention', 'reply', 'like', 'repost', 'quote', 'reply_like', 'reply_reply', 'tip', 'chill',
                  'weekly_box', 'ambassador', 'price_alert', 'wallet_trade', 'rug_alert', 'referral_gain', 'referral_recap'));

CREATE INDEX IF NOT EXISTS idx_referral_commissions_referrer_at ON public.referral_commissions (referrer_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_at ON public.referral_commissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals (referrer_wallet);

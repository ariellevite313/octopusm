-- Programme ambassadeur : 20 places au maximum, sur candidature validée par l'équipe.
-- Un ambassadeur touche 20 % des frais de la plateforme sur les achats de ses filleuls (10 % pour les autres parrains).
-- Ses filleuls reçoivent 200 OMERO de bienvenue et rejoignent sa communauté.
-- À lancer avec : docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/migrations/20261121_ambassadors.sql

ALTER TABLE public.octo_transactions DROP CONSTRAINT IF EXISTS octo_transactions_type_check;
ALTER TABLE public.octo_transactions ADD CONSTRAINT octo_transactions_type_check
  CHECK (type IN ('bet', 'task', 'referral', 'launch', 'swap', 'tip', 'tip_sent', 'community', 'welcome'));

-- Notification « tu es ambassadeur »
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('follow', 'mention', 'reply', 'like', 'repost', 'quote', 'reply_like', 'reply_reply', 'tip', 'chill', 'weekly_box', 'ambassador'));

-- Session de candidatures : date limite et date d'annonce, modifiables depuis l'admin (une seule ligne)
CREATE TABLE IF NOT EXISTS public.ambassador_settings (
  id           integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  apply_until  timestamptz,
  results_at   timestamptz
);
INSERT INTO public.ambassador_settings (id, apply_until, results_at)
VALUES (1, '2026-11-30 23:59:00+01', '2026-12-05 12:00:00+01') ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.ambassador_settings ENABLE ROW LEVEL SECURITY;

-- Candidatures : réseaux, expérience, projet
CREATE TABLE IF NOT EXISTS public.ambassador_applications (
  wallet         text PRIMARY KEY,
  x_handle       text,
  telegram       text,
  other_links    text CHECK (other_links IS NULL OR char_length(other_links) <= 500),
  followers      integer NOT NULL DEFAULT 0 CHECK (followers >= 0),
  country        text,
  language       text,
  crypto_since   text,
  communities    text CHECK (communities IS NULL OR char_length(communities) <= 800),
  events         text CHECK (events IS NULL OR char_length(events) <= 800),
  content_links  text CHECK (content_links IS NULL OR char_length(content_links) <= 800),
  other_programs text CHECK (other_programs IS NULL OR char_length(other_programs) <= 500),
  motivation     text CHECK (motivation IS NULL OR char_length(motivation) <= 1000),
  target_month   integer CHECK (target_month IS NULL OR target_month >= 0),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'removed')),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz
);

-- Ambassadeurs validés (active = false : retiré, il retombe au taux normal)
CREATE TABLE IF NOT EXISTS public.ambassadors (
  wallet        text PRIMARY KEY,
  active        boolean NOT NULL DEFAULT true,
  community_id  uuid REFERENCES public.communities (id) ON DELETE SET NULL,
  approved_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ambassadors_active ON public.ambassadors (wallet) WHERE active;

ALTER TABLE public.ambassador_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambassadors ENABLE ROW LEVEL SECURITY;

-- Bienvenue d'un filleul d'ambassadeur : 200 OMERO (une seule fois par wallet) et entrée dans sa communauté
CREATE OR REPLACE FUNCTION public.ambassador_welcome() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_amb record; v_lb text;
BEGIN
  SELECT a.wallet, a.community_id INTO v_amb FROM ambassadors a WHERE a.active AND same_wallet(a.wallet, NEW.referrer_wallet) LIMIT 1;
  IF v_amb.wallet IS NULL OR same_wallet(NEW.referrer_wallet, NEW.referred_wallet) THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM octo_transactions WHERE type = 'welcome' AND same_wallet(wallet_address, NEW.referred_wallet)) THEN
    INSERT INTO octo_transactions (wallet_address, type, amount, label) VALUES (NEW.referred_wallet, 'welcome', 200, 'ambassador:' || v_amb.wallet);
    SELECT wallet_address INTO v_lb FROM leaderboard_octo WHERE same_wallet(wallet_address, NEW.referred_wallet) ORDER BY total_octo DESC LIMIT 1;
    PERFORM add_leaderboard_octo(coalesce(v_lb, NEW.referred_wallet), 200);
  END IF;
  IF v_amb.community_id IS NOT NULL THEN
    INSERT INTO community_members (community_id, wallet, role) VALUES (v_amb.community_id, NEW.referred_wallet, 'member') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ambassador_welcome ON public.referrals;
CREATE TRIGGER trg_ambassador_welcome AFTER INSERT ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.ambassador_welcome();

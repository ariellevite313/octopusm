-- Discover : la vitrine des apps construites avec un token OM (comme un store).
-- Une fiche par token lancé sur OM ; son token doit être le moyen de paiement de l'app (affiché à tous les visiteurs).
-- Notes de 1 à 5 et avis, un seul par compte et par app, jamais par le propriétaire.
-- Idempotent : peut être relancé sans risque.

CREATE TABLE IF NOT EXISTS public.discover_apps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id      uuid NOT NULL UNIQUE REFERENCES public.launchpad_tokens (id) ON DELETE CASCADE,
  owner         text NOT NULL,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  tagline       text NOT NULL CHECK (char_length(tagline) BETWEEN 5 AND 80),
  description   text NOT NULL CHECK (char_length(description) BETWEEN 20 AND 2000),
  category      text NOT NULL CHECK (category IN ('ai', 'defi', 'gaming', 'payments', 'social', 'tools', 'nft', 'other')),
  site_url      text NOT NULL CHECK (site_url LIKE 'https://%'),
  icon_url      text,
  banner_url    text,
  screenshots   text[] NOT NULL DEFAULT '{}' CHECK (cardinality(screenshots) <= 6),
  payment_note  text NOT NULL CHECK (char_length(payment_note) BETWEEN 10 AND 200),
  status        text NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'hidden')),
  rating_avg    numeric NOT NULL DEFAULT 0,
  rating_count  integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discover_apps_live ON public.discover_apps (status, rating_avg DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discover_apps_owner ON public.discover_apps (owner);

CREATE TABLE IF NOT EXISTS public.discover_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      uuid NOT NULL REFERENCES public.discover_apps (id) ON DELETE CASCADE,
  wallet      text NOT NULL,
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        text CHECK (body IS NULL OR char_length(body) <= 600),
  hidden      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, wallet)
);
CREATE INDEX IF NOT EXISTS idx_discover_reviews_app ON public.discover_reviews (app_id, created_at DESC);

ALTER TABLE public.discover_apps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discover_reviews ENABLE ROW LEVEL SECURITY;
-- Aucune politique : lecture et écriture uniquement par le serveur (service role).

-- Note moyenne et nombre d'avis tenus à jour par la base (avis visibles seulement)
CREATE OR REPLACE FUNCTION public.discover_refresh_rating() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_app uuid := COALESCE(NEW.app_id, OLD.app_id);
BEGIN
  UPDATE discover_apps a SET
    rating_avg   = COALESCE((SELECT round(avg(rating)::numeric, 2) FROM discover_reviews r WHERE r.app_id = v_app AND NOT r.hidden), 0),
    rating_count = (SELECT count(*) FROM discover_reviews r WHERE r.app_id = v_app AND NOT r.hidden)
  WHERE a.id = v_app;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_discover_rating ON public.discover_reviews;
CREATE TRIGGER trg_discover_rating AFTER INSERT OR UPDATE OR DELETE ON public.discover_reviews
  FOR EACH ROW EXECUTE FUNCTION public.discover_refresh_rating();

-- Notification au propriétaire quand quelqu'un note son app
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('follow', 'mention', 'reply', 'like', 'repost', 'quote', 'reply_like', 'reply_reply', 'tip', 'chill',
                  'weekly_box', 'ambassador', 'price_alert', 'wallet_trade', 'rug_alert', 'referral_gain', 'referral_recap', 'app_review'));

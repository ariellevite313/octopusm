-- ──────────────────────────────────────────────────────────────────────────────
-- Follows + notifications.
-- A user follows another wallet and is notified when that wallet launches a token
-- or opens a prediction market. Notifications are fanned out by DB triggers, so
-- they work whatever code path activates the token/market.
-- Wallet addresses: Solana base58 as-is, EVM (Arc) lowercase.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wallet_follows (
  follower   text        NOT NULL,
  followed   text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower, followed),
  CHECK (follower <> followed)
);
CREATE INDEX IF NOT EXISTS idx_wallet_follows_followed ON public.wallet_follows (followed);

CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet     text        NOT NULL,            -- recipient
  type       text        NOT NULL,            -- 'token_launched' | 'market_created'
  actor      text        NOT NULL,            -- wallet that did the action
  title      text        NOT NULL,            -- token name / market title
  link       text        NOT NULL,            -- in-app path
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_notifications_wallet ON public.notifications (wallet, created_at DESC);

-- Only the server (service role) reads/writes these tables.
ALTER TABLE public.wallet_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications  ENABLE ROW LEVEL SECURITY;

-- ── Fan-out: token launched ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_followers_token() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active')
     AND NEW.creator_wallet IS NOT NULL
     AND COALESCE(NEW.is_hidden, false) = false THEN
    INSERT INTO public.notifications (wallet, type, actor, title, link)
    SELECT f.follower, 'token_launched', NEW.creator_wallet, NEW.name, '/launchpad/' || NEW.id
    FROM public.wallet_follows f
    WHERE lower(f.followed) = lower(NEW.creator_wallet);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_followers_token ON public.launchpad_tokens;
CREATE TRIGGER trg_notify_followers_token
  AFTER INSERT OR UPDATE OF status ON public.launchpad_tokens
  FOR EACH ROW EXECUTE FUNCTION public.notify_followers_token();

-- ── Fan-out: prediction market created (when it goes live) ────────────────────
CREATE OR REPLACE FUNCTION public.notify_followers_market() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active')
     AND NEW.creator_wallet IS NOT NULL THEN
    INSERT INTO public.notifications (wallet, type, actor, title, link)
    SELECT f.follower, 'market_created', NEW.creator_wallet, NEW.title,
           '/pools/' || COALESCE(NEW.slug, NEW.id::text)
    FROM public.wallet_follows f
    WHERE lower(f.followed) = lower(NEW.creator_wallet);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_followers_market ON public.mutuel_markets;
CREATE TRIGGER trg_notify_followers_market
  AFTER INSERT OR UPDATE OF status ON public.mutuel_markets
  FOR EACH ROW EXECUTE FUNCTION public.notify_followers_market();

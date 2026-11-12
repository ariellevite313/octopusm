-- Communautés publiques (comme sur X) : créées pour 100 OMERO, avec admin, modérateurs et membres.
-- Écritures uniquement par le serveur (service role) : RLS activée, aucune politique.
-- À lancer avec : docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/migrations/20261120_communities.sql

-- 1. Nouveau type de mouvement OMERO : création de communauté
ALTER TABLE public.octo_transactions DROP CONSTRAINT IF EXISTS octo_transactions_type_check;
ALTER TABLE public.octo_transactions ADD CONSTRAINT octo_transactions_type_check
  CHECK (type IN ('bet', 'task', 'referral', 'launch', 'swap', 'tip', 'tip_sent', 'community'));

-- 2. Communautés
CREATE TABLE IF NOT EXISTS public.communities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_]{3,30}$'),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 50),
  description   text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  category      text NOT NULL DEFAULT 'crypto',
  hashtags      text[] NOT NULL DEFAULT '{}' CHECK (coalesce(array_length(hashtags, 1), 0) <= 6),
  logo_src      text,
  banner_src    text,
  creator       text NOT NULL,
  token_id      uuid REFERENCES public.launchpad_tokens (id) ON DELETE SET NULL,
  member_count  integer NOT NULL DEFAULT 0,
  post_count    integer NOT NULL DEFAULT 0,
  pinned_post   uuid,
  hidden        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_communities_members ON public.communities (member_count DESC) WHERE NOT hidden;
CREATE INDEX IF NOT EXISTS idx_communities_created ON public.communities (created_at DESC) WHERE NOT hidden;

-- 3. Membres et rôles
CREATE TABLE IF NOT EXISTS public.community_members (
  community_id  uuid NOT NULL REFERENCES public.communities (id) ON DELETE CASCADE,
  wallet        text NOT NULL,
  role          text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'mod', 'member')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'banned')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, wallet)
);
CREATE INDEX IF NOT EXISTS idx_community_members_wallet ON public.community_members (wallet) WHERE status = 'active';

-- Nombre de membres tenu à jour automatiquement
CREATE OR REPLACE FUNCTION public.community_member_count() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_id uuid := coalesce(NEW.community_id, OLD.community_id);
BEGIN
  UPDATE public.communities SET member_count = (SELECT count(*) FROM public.community_members WHERE community_id = v_id AND status = 'active') WHERE id = v_id;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_community_member_count ON public.community_members;
CREATE TRIGGER trg_community_member_count AFTER INSERT OR UPDATE OR DELETE ON public.community_members
  FOR EACH ROW EXECUTE FUNCTION public.community_member_count();

-- 4. Posts publiés dans une communauté, communauté épinglée sur le profil, bio du profil
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES public.communities (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_posts_community ON public.posts (community_id, created_at DESC) WHERE community_id IS NOT NULL AND NOT hidden;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS pinned_community_id uuid REFERENCES public.communities (id) ON DELETE SET NULL;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS bio text CHECK (bio IS NULL OR char_length(bio) <= 160);

CREATE OR REPLACE FUNCTION public.community_post_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.community_id IS NOT NULL THEN
    UPDATE public.communities SET post_count = post_count + 1 WHERE id = NEW.community_id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_community_post_count ON public.posts;
CREATE TRIGGER trg_community_post_count AFTER INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.community_post_count();

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

-- 5. Création : solde OMERO vérifié et débité dans la même transaction, sous un verrou par créateur.
-- Renvoie {ok:true, id, slug, balance} ou {error:'code'}.
CREATE OR REPLACE FUNCTION public.create_community(
  p_creator text, p_slug text, p_name text, p_description text, p_category text, p_hashtags text[],
  p_logo text, p_banner text, p_cost integer, p_max_per_wallet integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance numeric;
  v_count   integer;
  v_id      uuid;
  v_lb      text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('community_create:' || lower(p_creator)));
  IF p_slug !~ '^[a-z0-9_]{3,30}$' THEN RETURN jsonb_build_object('error', 'invalid_slug'); END IF;
  IF EXISTS (SELECT 1 FROM communities WHERE slug = p_slug) THEN RETURN jsonb_build_object('error', 'slug_taken'); END IF;
  SELECT count(*) INTO v_count FROM communities WHERE same_wallet(creator, p_creator);
  IF v_count >= p_max_per_wallet THEN RETURN jsonb_build_object('error', 'limit_reached'); END IF;
  SELECT coalesce(sum(amount), 0) INTO v_balance FROM octo_transactions WHERE same_wallet(wallet_address, p_creator);
  IF v_balance < p_cost THEN RETURN jsonb_build_object('error', 'insufficient_balance'); END IF;

  INSERT INTO communities (slug, name, description, category, hashtags, logo_src, banner_src, creator)
  VALUES (p_slug, p_name, coalesce(p_description, ''), coalesce(p_category, 'crypto'), coalesce(p_hashtags, '{}'), p_logo, p_banner, p_creator)
  RETURNING id INTO v_id;
  INSERT INTO community_members (community_id, wallet, role) VALUES (v_id, p_creator, 'admin');
  INSERT INTO octo_transactions (wallet_address, type, amount, label) VALUES (p_creator, 'community', -p_cost, 'community:' || v_id);
  SELECT wallet_address INTO v_lb FROM leaderboard_octo WHERE same_wallet(wallet_address, p_creator) ORDER BY total_octo DESC LIMIT 1;
  PERFORM add_leaderboard_octo(coalesce(v_lb, p_creator), -p_cost);
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'slug', p_slug, 'balance', v_balance - p_cost);
END $$;
REVOKE ALL ON FUNCTION public.create_community(text, text, text, text, text, text[], text, text, integer, integer) FROM public, anon, authenticated;

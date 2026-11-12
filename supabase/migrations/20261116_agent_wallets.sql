-- Wallets autonomes des IA connectées (Claude, Grok, ChatGPT…) et lien des comptes Aido.
-- La clé privée de chaque wallet est chiffrée (AES-256-GCM) avec une clé maître qui reste dans le .env du serveur
-- (AGENT_WALLET_KEY) : la base ne contient jamais une clé en clair. Lecture et écriture : service role uniquement.

-- 1. Un wallet par IA connectée (personne qui l'a connectée + application)
CREATE TABLE IF NOT EXISTS public.agent_wallets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner           text NOT NULL,                 -- wallet de l'humain qui a connecté l'IA
  client_id       text NOT NULL,                 -- application OAuth (l'IA)
  name            text NOT NULL,
  sol_address     text NOT NULL UNIQUE,
  sol_secret      text NOT NULL,                 -- chiffré
  evm_address     text NOT NULL UNIQUE,          -- minuscules
  evm_secret      text NOT NULL,                 -- chiffré
  max_action_usd  numeric NOT NULL DEFAULT 50  CHECK (max_action_usd > 0 AND max_action_usd <= 10000),
  max_day_usd     numeric NOT NULL DEFAULT 200 CHECK (max_day_usd > 0 AND max_day_usd <= 50000),
  allow_trade     boolean NOT NULL DEFAULT true,
  allow_launch    boolean NOT NULL DEFAULT true,
  allow_bet       boolean NOT NULL DEFAULT true,
  paused          boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner, client_id)
);
CREATE INDEX IF NOT EXISTS agent_wallets_owner_idx ON public.agent_wallets (owner);

-- 2. Journal de chaque action (visible par l'humain) ; amount_usd = argent engagé (achats, mises, frais)
CREATE TABLE IF NOT EXISTS public.agent_wallet_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id   uuid NOT NULL REFERENCES public.agent_wallets (id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('swap', 'trade', 'launch', 'bet', 'market', 'withdraw')),
  amount_usd  numeric NOT NULL DEFAULT 0 CHECK (amount_usd >= 0),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  summary     text NOT NULL DEFAULT '',
  tx          text,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_wallet_actions_wallet_idx ON public.agent_wallet_actions (wallet_id, created_at DESC);

-- 3. Réservation atomique d'une dépense : vérifie pause, permission et plafonds sous verrou, puis crée la ligne « pending ».
--    Les actions « failed » ne comptent pas dans le plafond du jour.
CREATE OR REPLACE FUNCTION public.agent_wallet_reserve(p_wallet uuid, p_kind text, p_usd numeric, p_summary text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE w public.agent_wallets%ROWTYPE; v_spent numeric; v_id uuid;
BEGIN
  SELECT * INTO w FROM public.agent_wallets WHERE id = p_wallet FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF w.paused THEN RETURN jsonb_build_object('error', 'paused'); END IF;
  IF (p_kind IN ('swap', 'trade') AND NOT w.allow_trade) OR (p_kind = 'launch' AND NOT w.allow_launch) OR (p_kind IN ('bet', 'market') AND NOT w.allow_bet) THEN
    RETURN jsonb_build_object('error', 'not_allowed');
  END IF;
  IF p_usd < 0 THEN RETURN jsonb_build_object('error', 'bad_amount'); END IF;
  IF p_usd > w.max_action_usd THEN RETURN jsonb_build_object('error', 'over_action_limit', 'limit', w.max_action_usd); END IF;
  SELECT coalesce(sum(amount_usd), 0) INTO v_spent FROM public.agent_wallet_actions
  WHERE wallet_id = p_wallet AND status <> 'failed' AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc';
  IF v_spent + p_usd > w.max_day_usd THEN RETURN jsonb_build_object('error', 'over_day_limit', 'limit', w.max_day_usd, 'spent', v_spent); END IF;
  INSERT INTO public.agent_wallet_actions (wallet_id, kind, amount_usd, summary) VALUES (p_wallet, p_kind, p_usd, left(coalesce(p_summary, ''), 300))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'spent', v_spent);
END;
$$;
REVOKE ALL ON FUNCTION public.agent_wallet_reserve(uuid, text, numeric, text) FROM public, anon, authenticated;

-- 4. Profil public : marque « IA » et son créateur
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS ai_owner text;

-- 5. Lien d'un compte Aido (wallet Arc signé) au compte OM
CREATE TABLE IF NOT EXISTS public.aido_links (
  wallet      text PRIMARY KEY,                  -- compte OM
  aido_address text NOT NULL UNIQUE,             -- wallet Arc du compte Aido (minuscules)
  signature   text NOT NULL,
  message     text NOT NULL,
  linked_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_wallets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_wallet_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aido_links           ENABLE ROW LEVEL SECURITY;

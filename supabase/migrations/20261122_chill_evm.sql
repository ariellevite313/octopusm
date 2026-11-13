-- « Chill ton sac » sur les réseaux EVM : le détenteur montre un token EVM dans le fil ; les achats et ventes faits depuis
-- son post paient les frais OM à la plateforme (0x ne sait payer qu'un destinataire), et 40 % sont cumulés pour le détenteur.

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS bag_chain text;      -- null = Solana
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS bag_holder text;     -- adresse EVM du détenteur (réseaux EVM)

CREATE TABLE IF NOT EXISTS public.chill_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  chain text NOT NULL,
  holder text NOT NULL,                 -- adresse EVM à payer
  taker text NOT NULL,                  -- acheteur / vendeur
  token text NOT NULL,
  tx_hash text NOT NULL,
  fee_native numeric NOT NULL,          -- frais OM de la transaction, en wei
  owed_native numeric NOT NULL,         -- part du détenteur (40 %), en wei
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_tx text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain, tx_hash)
);
CREATE INDEX IF NOT EXISTS chill_rewards_holder_idx ON public.chill_rewards (holder, status);
ALTER TABLE public.chill_rewards ENABLE ROW LEVEL SECURITY;
-- Aucune politique : lecture et écriture uniquement par le serveur (clé de service).

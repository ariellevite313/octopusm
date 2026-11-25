-- Discover sans token : l'admin peut lister ce qu'il veut sans token ; les autres paient 80 $ (USDC, un an).
-- Les fiches avec un token OM restent comme avant. Idempotent.
ALTER TABLE public.discover_apps ALTER COLUMN token_id DROP NOT NULL;
ALTER TABLE public.discover_apps ALTER COLUMN payment_note DROP NOT NULL;
ALTER TABLE public.discover_apps DROP CONSTRAINT IF EXISTS discover_apps_payment_note_check;
ALTER TABLE public.discover_apps ADD CONSTRAINT discover_apps_payment_note_check
  CHECK (payment_note IS NULL OR char_length(payment_note) BETWEEN 10 AND 200);
-- Réseau affiché pour une fiche sans token (Solana, Arc…)
ALTER TABLE public.discover_apps ADD COLUMN IF NOT EXISTS network text;
ALTER TABLE public.discover_apps DROP CONSTRAINT IF EXISTS discover_apps_network_check;
ALTER TABLE public.discover_apps ADD CONSTRAINT discover_apps_network_check
  CHECK (network IS NULL OR network IN ('solana', 'arc', 'base', 'bnb', 'ethereum', 'other'));
-- Fin de la période payée d'une fiche sans token (vide pour l'admin)
ALTER TABLE public.discover_apps ADD COLUMN IF NOT EXISTS listing_paid_until timestamptz;
-- Paiements reçus : une transaction ne sert qu'une fois
CREATE TABLE IF NOT EXISTS public.discover_listing_payments (
  tx         text PRIMARY KEY,
  app_id     uuid REFERENCES public.discover_apps (id) ON DELETE SET NULL,
  wallet     text NOT NULL,
  amount_usd numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.discover_listing_payments ENABLE ROW LEVEL SECURITY;

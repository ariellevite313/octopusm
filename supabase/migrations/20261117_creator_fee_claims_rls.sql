-- creator_fee_claims n'avait pas la RLS : la clé anon (publique) pouvait lire et modifier la table via l'API REST.
-- Toutes les lectures et écritures passent par le serveur (service role), donc aucune policy n'est nécessaire.
ALTER TABLE public.creator_fee_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creator_fee_claims FROM anon, authenticated;

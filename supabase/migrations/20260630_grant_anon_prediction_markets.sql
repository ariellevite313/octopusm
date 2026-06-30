-- ─── GRANT SELECT TO anon — prediction_markets ────────────────────────────────
-- Même problème que pour referral_codes / octo_transactions :
-- sans GRANT explicite, la RLS (même avec USING (true)) est ignorée
-- et le client anon reçoit [] silencieusement.

GRANT SELECT ON public.prediction_markets TO anon, authenticated;

-- Si la table a RLS activé sans policy publique, on en crée une
-- (compatible IF NOT EXISTS — pas d'erreur si elle existe déjà)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'prediction_markets'
      AND policyname = 'prediction_markets_select_public'
  ) THEN
    EXECUTE '
      CREATE POLICY prediction_markets_select_public
        ON prediction_markets FOR SELECT
        USING (true)
    ';
  END IF;
END
$$;

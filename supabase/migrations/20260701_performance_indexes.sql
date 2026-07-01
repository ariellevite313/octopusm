-- Performance indexes — Octopus Market
-- À coller dans Supabase Dashboard → SQL Editor et exécuter.
-- Ces indexes accélèrent getActiveMarkets() et getPredictionHistory().

-- 1. Partial index sur prediction_markets (is_active + created_at)
--    Accélère : SELECT * FROM prediction_markets WHERE is_active = true ORDER BY created_at DESC
--    ~2x plus rapide qu'un index standard car il n'indexe que les lignes actives.
CREATE INDEX IF NOT EXISTS idx_prediction_markets_active_date
  ON public.prediction_markets (created_at DESC)
  WHERE is_active = true;

-- 2. Index composite sur prediction_history (wallet_address + created_at)
--    Accélère : SELECT * FROM prediction_history WHERE wallet_address = ? ORDER BY created_at DESC
--    Transforme un full scan en index scan O(log n).
CREATE INDEX IF NOT EXISTS idx_prediction_history_wallet_date
  ON public.prediction_history (wallet_address, created_at DESC);

-- 3. (Optionnel) Index sur prediction_markets pour les requêtes admin (tous les marchés triés)
--    Accélère : SELECT * FROM prediction_markets ORDER BY created_at DESC (getAllMarketsAdmin)
CREATE INDEX IF NOT EXISTS idx_prediction_markets_created_at
  ON public.prediction_markets (created_at DESC);

-- Vérification : liste les index créés sur ces tables
SELECT
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE tablename IN ('prediction_markets', 'prediction_history')
  AND schemaname = 'public'
ORDER BY tablename, indexname;

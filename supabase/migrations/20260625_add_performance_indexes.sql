-- =============================================================================
-- Migration : index de performance sur les colonnes les plus filtrées
-- À exécuter dans : Supabase Dashboard → SQL Editor
--
-- Ces index couvrent toutes les requêtes fréquentes identifiées dans l'audit :
--   • getActiveMarkets()       → is_active = true, ORDER BY created_at DESC
--   • getResolvedMarkets()     → is_resolved = true, ORDER BY resolved_at DESC
--   • getPredictionHistory()   → wallet_address, ORDER BY created_at DESC
--   • getAllPaymentsAdmin()     → created_at DESC
--   • getPendingPayments()     → status = 'pending', ORDER BY created_at ASC
--   • getPaymentsByWallet()    → user_wallet, ORDER BY created_at DESC
--   • getListingsByWallet()    → wallet_address, ORDER BY submitted_at DESC  (ai_listings utilise submitted_at)
--   • getApprovedListings()    → status = 'approved', ORDER BY submitted_at DESC
-- =============================================================================

-- ── prediction_markets ────────────────────────────────────────────────────────

-- Index partiel sur les marchés actifs (vue principale de l'app)
CREATE INDEX IF NOT EXISTS idx_prediction_markets_active_created
  ON prediction_markets (created_at DESC)
  WHERE is_active = true;

-- Index partiel sur les marchés résolus (page archive)
CREATE INDEX IF NOT EXISTS idx_prediction_markets_resolved_at
  ON prediction_markets (resolved_at DESC)
  WHERE is_resolved = true;

-- Index sur category_id pour le filtrage par catégorie
CREATE INDEX IF NOT EXISTS idx_prediction_markets_category
  ON prediction_markets (category_id, created_at DESC);

-- ── prediction_history ────────────────────────────────────────────────────────

-- Index principal : historique par wallet (dashboard utilisateur)
CREATE INDEX IF NOT EXISTS idx_prediction_history_wallet_created
  ON prediction_history (wallet_address, created_at DESC);

-- Index sur market_id (résolution groupée des paris d'un marché)
CREATE INDEX IF NOT EXISTS idx_prediction_history_market
  ON prediction_history (market_id);

-- Index partiel sur les paris en attente de payout
CREATE INDEX IF NOT EXISTS idx_prediction_history_pending_payout
  ON prediction_history (wallet_address, payout_status)
  WHERE payout_status IS NULL;

-- ── payments ──────────────────────────────────────────────────────────────────

-- Index pour les paiements en attente (panel admin)
CREATE INDEX IF NOT EXISTS idx_payments_status_created
  ON payments (status, created_at ASC)
  WHERE status = 'pending';

-- Index pour les paiements par wallet (dashboard utilisateur)
CREATE INDEX IF NOT EXISTS idx_payments_user_wallet_created
  ON payments (user_wallet, created_at DESC);

-- ── ai_listings ───────────────────────────────────────────────────────────────
-- NB : ai_listings utilise submitted_at (pas created_at)

-- Index pour les listings approuvés (vue publique)
CREATE INDEX IF NOT EXISTS idx_ai_listings_approved_submitted
  ON ai_listings (submitted_at DESC)
  WHERE status = 'approved';

-- Index pour les listings par wallet
CREATE INDEX IF NOT EXISTS idx_ai_listings_wallet_submitted
  ON ai_listings (wallet_address, submitted_at DESC);

-- ── wallets ───────────────────────────────────────────────────────────────────

-- Index pour le tri par activité récente (admin registry)
CREATE INDEX IF NOT EXISTS idx_wallets_activity
  ON wallets (latest_activity_at DESC);

-- =============================================================================
-- Vérification : lister les index créés
-- =============================================================================
-- SELECT indexname, tablename, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;

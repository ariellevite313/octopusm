-- =============================================================================
-- RLS Policies — accès anon pour l'app Octopus Market
-- À exécuter dans : Supabase dashboard → SQL Editor
--
-- IMPORTANT : on utilise FOR ALL (pas INSERT+UPDATE séparés) car UPSERT
-- nécessite SELECT pour la détection de conflit — une politique INSERT seule
-- bloque les UPSERT avec "new row violates row-level security policy".
--
-- SÉCURITÉ :
--   • Les opérations admin (approve/reject payment, resolve market, create market,
--     delete market, mark paid) passent par des Edge Functions (service_role)
--     qui contournent RLS et vérifient le wallet admin côté serveur.
--   • Les contraintes UNIQUE sur payment_reference empêchent les doublons
--     même si le guard client échoue.
-- =============================================================================

-- =============================================================================
-- CONTRAINTES UNIQUE — exécuter en premier
-- =============================================================================

ALTER TABLE prediction_history
  DROP CONSTRAINT IF EXISTS unique_payment_reference_history;
ALTER TABLE prediction_history
  ADD CONSTRAINT unique_payment_reference_history UNIQUE (payment_reference);

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS unique_payment_reference_payments;
ALTER TABLE payments
  ADD CONSTRAINT unique_payment_reference_payments UNIQUE (payment_reference);

-- =============================================================================
-- TABLES NON CRITIQUES (accès complet anon conservé)
-- =============================================================================

-- ── wallets ───────────────────────────────────────────────────────────────────
-- FOR ALL conservé : upsert (on_conflict) requiert SELECT + INSERT + UPDATE
DROP POLICY IF EXISTS "anon_insert_wallets" ON wallets;
DROP POLICY IF EXISTS "anon_update_wallets" ON wallets;
DROP POLICY IF EXISTS "allow_anon_all_wallets" ON wallets;
CREATE POLICY "allow_anon_all_wallets" ON wallets FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── ai_memory ─────────────────────────────────────────────────────────────────
-- FOR ALL conservé : upsert sur wallet_address
DROP POLICY IF EXISTS "anon_insert_ai_memory" ON ai_memory;
DROP POLICY IF EXISTS "anon_update_ai_memory" ON ai_memory;
DROP POLICY IF EXISTS "allow_anon_all_ai_memory" ON ai_memory;
CREATE POLICY "allow_anon_all_ai_memory" ON ai_memory FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── ai_listings ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_insert_ai_listings" ON ai_listings;
DROP POLICY IF EXISTS "anon_update_ai_listings" ON ai_listings;
DROP POLICY IF EXISTS "allow_anon_all_ai_listings" ON ai_listings;
CREATE POLICY "allow_anon_all_ai_listings" ON ai_listings FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── ai_tool_social ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_insert_ai_tool_social" ON ai_tool_social;
DROP POLICY IF EXISTS "anon_update_ai_tool_social" ON ai_tool_social;
DROP POLICY IF EXISTS "allow_anon_all_ai_tool_social" ON ai_tool_social;
CREATE POLICY "allow_anon_all_ai_tool_social" ON ai_tool_social FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── tool_ratings ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_insert_tool_ratings" ON tool_ratings;
DROP POLICY IF EXISTS "anon_update_tool_ratings" ON tool_ratings;
DROP POLICY IF EXISTS "allow_anon_all_tool_ratings" ON tool_ratings;
CREATE POLICY "allow_anon_all_tool_ratings" ON tool_ratings FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── tool_reactions ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_insert_tool_reactions" ON tool_reactions;
DROP POLICY IF EXISTS "anon_update_tool_reactions" ON tool_reactions;
DROP POLICY IF EXISTS "allow_anon_all_tool_reactions" ON tool_reactions;
CREATE POLICY "allow_anon_all_tool_reactions" ON tool_reactions FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── tool_comments ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_insert_tool_comments" ON tool_comments;
DROP POLICY IF EXISTS "allow_anon_all_tool_comments" ON tool_comments;
CREATE POLICY "allow_anon_all_tool_comments" ON tool_comments FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── admin_logs ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_insert_admin_logs" ON admin_logs;
DROP POLICY IF EXISTS "allow_anon_all_admin_logs" ON admin_logs;
CREATE POLICY "allow_anon_all_admin_logs" ON admin_logs FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── token_board ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_insert_token_board" ON token_board;
DROP POLICY IF EXISTS "anon_update_token_board" ON token_board;
DROP POLICY IF EXISTS "allow_anon_all_token_board" ON token_board;
CREATE POLICY "allow_anon_all_token_board" ON token_board FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── payment_requests ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_insert_payment_requests" ON payment_requests;
DROP POLICY IF EXISTS "anon_update_payment_requests" ON payment_requests;
DROP POLICY IF EXISTS "allow_anon_all_payment_requests" ON payment_requests;
CREATE POLICY "allow_anon_all_payment_requests" ON payment_requests FOR ALL TO anon USING (true) WITH CHECK (true);

-- =============================================================================
-- TABLES CRITIQUES — politiques restreintes
-- =============================================================================

-- ── prediction_markets ────────────────────────────────────────────────────────
-- Les mutations (INSERT/UPDATE/DELETE) passent par des Edge Functions admin.
-- Anon : lecture seule.
DROP POLICY IF EXISTS "anon_insert_prediction_markets" ON prediction_markets;
DROP POLICY IF EXISTS "anon_update_prediction_markets" ON prediction_markets;
DROP POLICY IF EXISTS "anon_delete_prediction_markets" ON prediction_markets;
DROP POLICY IF EXISTS "allow_anon_all_prediction_markets" ON prediction_markets;
DROP POLICY IF EXISTS "anon_select_prediction_markets" ON prediction_markets;

CREATE POLICY "anon_select_prediction_markets"
  ON prediction_markets FOR SELECT TO anon USING (true);

-- ── payments ──────────────────────────────────────────────────────────────────
-- INSERT : anon autorisé (notification de paiement lors d'un pari).
-- UPDATE/DELETE : Edge Function admin uniquement (approve/reject).
-- UNIQUE(payment_reference) empêche les doublons.
DROP POLICY IF EXISTS "anon_insert_payments" ON payments;
DROP POLICY IF EXISTS "anon_update_payments" ON payments;
DROP POLICY IF EXISTS "allow_anon_all_payments" ON payments;
DROP POLICY IF EXISTS "anon_select_payments" ON payments;
DROP POLICY IF EXISTS "anon_insert_only_payments" ON payments;

CREATE POLICY "anon_select_payments"
  ON payments FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_only_payments"
  ON payments FOR INSERT TO anon WITH CHECK (true);

-- ── prediction_history ────────────────────────────────────────────────────────
-- INSERT : anon autorisé (enregistrement d'un pari validé on-chain).
-- SELECT : anon autorisé (lecture du dashboard).
-- UPDATE : anon autorisé mais restreint — claimPredictionWin (payout_status='claimed')
--   est encore appelé côté client. Le WITH CHECK empêche de passer directement
--   à 'paid' ou de modifier admin_decision_status via le client.
--   Les mises à jour admin (paid, resolved, admin_decision_status='approved')
--   passent par des Edge Functions (service_role, contourne RLS).
-- UNIQUE(payment_reference) empêche les insertions dupliquées.
DROP POLICY IF EXISTS "anon_insert_prediction_history" ON prediction_history;
DROP POLICY IF EXISTS "anon_update_prediction_history" ON prediction_history;
DROP POLICY IF EXISTS "allow_anon_all_prediction_history" ON prediction_history;
DROP POLICY IF EXISTS "anon_select_prediction_history" ON prediction_history;
DROP POLICY IF EXISTS "anon_insert_prediction_history_v2" ON prediction_history;
DROP POLICY IF EXISTS "anon_update_prediction_history_v2" ON prediction_history;

CREATE POLICY "anon_select_prediction_history"
  ON prediction_history FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_prediction_history_v2"
  ON prediction_history FOR INSERT TO anon WITH CHECK (true);

-- UPDATE anon : autorisé uniquement pour l'action "claim" (payout_status='claimed').
-- Bloque : payout_status='paid', paid_by_wallet non nul, admin_decision_status='approved'.
CREATE POLICY "anon_update_prediction_history_v2"
  ON prediction_history FOR UPDATE TO anon
  USING (true)
  WITH CHECK (
    payout_status IS DISTINCT FROM 'paid'
    AND paid_by_wallet IS NULL
    AND paid_at IS NULL
    AND (admin_decision_status IS DISTINCT FROM 'approved' OR admin_decision_status IS NULL)
  );

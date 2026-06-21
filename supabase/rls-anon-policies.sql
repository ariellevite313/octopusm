-- =============================================================================
-- RLS Policies — accès anon pour l'app Octopus Market
-- À exécuter dans : Supabase dashboard → SQL Editor
--
-- IMPORTANT : on utilise FOR ALL (pas INSERT+UPDATE séparés) car UPSERT
-- nécessite SELECT pour la détection de conflit — une politique INSERT seule
-- bloque les UPSERT avec "new row violates row-level security policy".
-- =============================================================================

-- ── wallets ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_insert_wallets" ON wallets;
DROP POLICY IF EXISTS "anon_update_wallets" ON wallets;
DROP POLICY IF EXISTS "allow_anon_all_wallets" ON wallets;
CREATE POLICY "allow_anon_all_wallets" ON wallets FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── ai_memory ─────────────────────────────────────────────────────────────────
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

-- ── prediction_markets ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_insert_prediction_markets" ON prediction_markets;
DROP POLICY IF EXISTS "anon_update_prediction_markets" ON prediction_markets;
DROP POLICY IF EXISTS "anon_delete_prediction_markets" ON prediction_markets;
DROP POLICY IF EXISTS "allow_anon_all_prediction_markets" ON prediction_markets;
CREATE POLICY "allow_anon_all_prediction_markets" ON prediction_markets FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── prediction_history ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_insert_prediction_history" ON prediction_history;
DROP POLICY IF EXISTS "anon_update_prediction_history" ON prediction_history;
DROP POLICY IF EXISTS "allow_anon_all_prediction_history" ON prediction_history;
CREATE POLICY "allow_anon_all_prediction_history" ON prediction_history FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── payments ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_insert_payments" ON payments;
DROP POLICY IF EXISTS "anon_update_payments" ON payments;
DROP POLICY IF EXISTS "allow_anon_all_payments" ON payments;
CREATE POLICY "allow_anon_all_payments" ON payments FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── payment_requests ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_insert_payment_requests" ON payment_requests;
DROP POLICY IF EXISTS "anon_update_payment_requests" ON payment_requests;
DROP POLICY IF EXISTS "allow_anon_all_payment_requests" ON payment_requests;
CREATE POLICY "allow_anon_all_payment_requests" ON payment_requests FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── token_board ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_insert_token_board" ON token_board;
DROP POLICY IF EXISTS "anon_update_token_board" ON token_board;
DROP POLICY IF EXISTS "allow_anon_all_token_board" ON token_board;
CREATE POLICY "allow_anon_all_token_board" ON token_board FOR ALL TO anon USING (true) WITH CHECK (true);

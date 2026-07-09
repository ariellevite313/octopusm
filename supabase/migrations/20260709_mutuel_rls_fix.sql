-- ============================================================
-- Fix RLS policies: replace get_wallet_address() with auth.uid()::text
-- Run in Supabase SQL Editor
-- ============================================================

DROP POLICY IF EXISTS "mutuel_markets_creator_read_own" ON mutuel_markets;
DROP POLICY IF EXISTS "mutuel_markets_insert_authed" ON mutuel_markets;
DROP POLICY IF EXISTS "mutuel_bets_insert_authed" ON mutuel_bets;

CREATE POLICY "mutuel_markets_creator_read_own"
  ON mutuel_markets FOR SELECT
  USING (creator_wallet = auth.uid()::text);

CREATE POLICY "mutuel_markets_insert_authed"
  ON mutuel_markets FOR INSERT
  WITH CHECK (creator_wallet = auth.uid()::text);

CREATE POLICY "mutuel_bets_insert_authed"
  ON mutuel_bets FOR INSERT
  WITH CHECK (
    wallet_address = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM mutuel_markets m
      WHERE m.id = market_id
        AND m.status = 'active'
        AND m.betting_closes_at > now()
    )
  );

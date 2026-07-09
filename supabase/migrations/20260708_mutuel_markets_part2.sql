-- ============================================================
-- Pari Mutuel System — PART 2: RLS policies
-- Run AFTER Part 1
-- ============================================================

-- mutuel_markets: anyone can read active/closed/resolved markets
CREATE POLICY "mutuel_markets_public_read"
  ON mutuel_markets FOR SELECT
  USING (status IN ('active', 'closed', 'resolved'));

-- mutuel_markets: creator can always read their own market (any status)
CREATE POLICY "mutuel_markets_creator_read_own"
  ON mutuel_markets FOR SELECT
  USING (creator_wallet = get_wallet_address());

-- mutuel_markets: admin has full access
CREATE POLICY "mutuel_markets_admin_all"
  ON mutuel_markets FOR ALL
  USING (is_admin());

-- mutuel_markets: authenticated user can create a market for themselves
CREATE POLICY "mutuel_markets_insert_authed"
  ON mutuel_markets FOR INSERT
  WITH CHECK (creator_wallet = get_wallet_address());

-- mutuel_bets: bets are publicly readable
CREATE POLICY "mutuel_bets_public_read"
  ON mutuel_bets FOR SELECT
  USING (TRUE);

-- mutuel_bets: can only bet on active markets before close time
CREATE POLICY "mutuel_bets_insert_authed"
  ON mutuel_bets FOR INSERT
  WITH CHECK (
    wallet_address = get_wallet_address()
    AND EXISTS (
      SELECT 1 FROM mutuel_markets m
      WHERE m.id = market_id
        AND m.status = 'active'
        AND m.betting_closes_at > now()
    )
  );

-- mutuel_bets: admin has full access
CREATE POLICY "mutuel_bets_admin_all"
  ON mutuel_bets FOR ALL
  USING (is_admin());

-- Atomic increment for pool totals to prevent race conditions
CREATE OR REPLACE FUNCTION increment_pool_total(
  p_market_id  UUID,
  p_token      TEXT,
  p_amount     NUMERIC
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_token = 'usdc' THEN
    UPDATE mutuel_markets
    SET total_pool_usdc = total_pool_usdc + p_amount,
        bet_count       = bet_count + 1
    WHERE id = p_market_id;
  ELSE
    UPDATE mutuel_markets
    SET total_pool_clt = total_pool_clt + p_amount,
        bet_count      = bet_count + 1
    WHERE id = p_market_id;
  END IF;
END;
$$;

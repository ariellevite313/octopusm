-- RPC atomique pour incrémenter pool_up ou pool_down dans updown_markets
-- À exécuter dans Supabase SQL Editor (une seule fois)
--
-- Usage depuis le client JS :
--   supabase.rpc("increment_updown_pool", {
--     p_market_id: "...",
--     p_column: "pool_up" | "pool_down",
--     p_amount: 10.5
--   })

CREATE OR REPLACE FUNCTION increment_updown_pool(
  p_market_id UUID,
  p_column    TEXT,
  p_amount    NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_column = 'pool_up' THEN
    UPDATE updown_markets
    SET pool_up = COALESCE(pool_up, 0) + p_amount
    WHERE id = p_market_id;
  ELSIF p_column = 'pool_down' THEN
    UPDATE updown_markets
    SET pool_down = COALESCE(pool_down, 0) + p_amount
    WHERE id = p_market_id;
  ELSE
    RAISE EXCEPTION 'Invalid column: %', p_column;
  END IF;
END;
$$;

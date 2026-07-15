import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const BINANCE_URL = "https://api.binance.com/api/v3/ticker/price";

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fetch all 3 prices in parallel from Binance
  const results = await Promise.allSettled(
    SYMBOLS.map(async (symbol) => {
      const res = await fetch(`${BINANCE_URL}?symbol=${symbol}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Binance ${res.status} for ${symbol}`);
      const data: { symbol: string; price: string } = await res.json();
      return { symbol, price: parseFloat(data.price) };
    })
  );

  const rows = results
    .filter((r): r is PromiseFulfilledResult<{ symbol: string; price: number }> =>
      r.status === "fulfilled"
    )
    .map((r) => ({
      symbol: r.value.symbol,
      price: r.value.price,
      recorded_at: new Date().toISOString(),
    }));

  if (rows.length === 0) {
    return new Response(JSON.stringify({ error: "All Binance fetches failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase.from("crypto_prices").insert(rows);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, inserted: rows.length, symbols: rows.map((r) => r.symbol) }),
    { headers: { "Content-Type": "application/json" } }
  );
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const COINGECKO_IDS: Record<string, string> = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  SOLUSDT: "solana",
};

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fetch all 3 prices in one CoinGecko call
  const ids = SYMBOLS.map((s) => COINGECKO_IDS[s]).join(",");
  let rows: { symbol: string; price: number; recorded_at: string }[] = [];

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data: Record<string, { usd: number }> = await res.json();

    const now = new Date().toISOString();
    rows = SYMBOLS
      .map((symbol) => {
        const coinId = COINGECKO_IDS[symbol];
        const price = data[coinId]?.usd;
        if (!price) return null;
        return { symbol, price, recorded_at: now };
      })
      .filter((r): r is { symbol: string; price: number; recorded_at: string } => r !== null);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: `CoinGecko fetch failed: ${e instanceof Error ? e.message : e}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  if (rows.length === 0) {
    return new Response(JSON.stringify({ error: "No prices returned" }), {
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

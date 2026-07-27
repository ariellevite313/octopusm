import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";

/**
 * Fetch les klines 1s des ~65 dernières secondes pour un symbol
 * et retourne les points { time, price }.
 * On prend 65s pour couvrir le décalage cron (tourne à la minute ronde).
 */
async function fetchRecentKlines(symbol: string): Promise<{ time: number; price: number }[]> {
  const now = Date.now();
  const from = now - 65_000; // 65s en arrière
  const url = `${BINANCE_KLINES_URL}?symbol=${symbol}&interval=1s&startTime=${from}&endTime=${now}&limit=65`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Binance klines HTTP ${res.status}`);

  const data: [number, string, string, string, string, ...unknown[]][] = await res.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error("No kline data");

  return data.map((k) => ({
    time:  k[0] as number,          // openTime ms
    price: parseFloat(k[4] as string), // close price
  }));
}

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: string[] = [];
  const errors:  string[] = [];

  await Promise.all(
    SYMBOLS.map(async (symbol) => {
      try {
        const points = await fetchRecentKlines(symbol);

        // Upsert — ignore les doublons (même symbol+time déjà en DB)
        const rows = points.map((p) => ({ symbol, time: p.time, price: p.price }));
        const { error } = await supabase
          .from("price_history")
          .upsert(rows, { onConflict: "symbol,time", ignoreDuplicates: true });

        if (error) throw new Error(error.message);
        results.push(`${symbol}: ${rows.length} points insérés`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${symbol}: ${msg}`);
        console.error(`[record-price-history] ${symbol}:`, msg);
      }
    })
  );

  return new Response(
    JSON.stringify({ ok: true, results, errors }),
    { headers: { "Content-Type": "application/json" } }
  );
});

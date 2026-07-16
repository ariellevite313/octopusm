import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const DURATIONS = [5, 15, 30]; // minutes (durée totale du round)
const BINANCE_URL = "https://api.binance.com/api/v3/ticker/price";

// Durée de la phase de paris (en minutes) par durée totale de round
// Le reste = phase LIVE (on regarde le graphe, plus de paris)
// 5min  → 3min paris + 2min live
// 15min → 10min paris + 5min live
// 30min → 20min paris + 10min live
const BETTING_MINUTES: Record<number, number> = {
  5: 3,
  15: 10,
  30: 20,
};

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = new Date();
  const nowMs = now.getTime();
  const created: string[] = [];

  for (const symbol of SYMBOLS) {
    // Fetch current price once per symbol
    let strikePrice: number;
    try {
      const res = await fetch(`${BINANCE_URL}?symbol=${symbol}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Binance ${res.status}`);
      const data: { price: string } = await res.json();
      strikePrice = parseFloat(data.price);
    } catch (e) {
      console.error(`[create-updown] Price fetch failed for ${symbol}:`, e);
      continue;
    }

    for (const duration of DURATIONS) {
      const slotMs = duration * 60 * 1000;

      // Current slot (the one that contains "now")
      const currentSlotStart = Math.floor(nowMs / slotMs) * slotMs;
      // Next slot
      const nextSlotStart = currentSlotStart + slotMs;

      // Try to create both current and next slot
      for (const slotStart of [currentSlotStart, nextSlotStart]) {
        const opensAt  = new Date(slotStart);
        const closesAt = new Date(slotStart + (BETTING_MINUTES[duration] ?? duration) * 60 * 1000);
        const resolveAt = new Date(slotStart + slotMs); // fin totale du round

        // Skip if already fully resolved
        if (resolveAt.getTime() <= nowMs) continue;

        // Check if already exists
        const { data: existing } = await supabase
          .from("updown_markets")
          .select("id")
          .eq("symbol", symbol)
          .eq("duration_min", duration)
          .eq("opens_at", opensAt.toISOString())
          .maybeSingle();

        if (existing) continue;

        // Create the market
        const { error } = await supabase.from("updown_markets").insert({
          symbol,
          duration_min: duration,
          strike_price: strikePrice,
          opens_at:   opensAt.toISOString(),
          closes_at:  closesAt.toISOString(),
          resolve_at: resolveAt.toISOString(),
          status: "open",
          pool_up: 0,
          pool_down: 0,
          fee_rate: 5,
        });

        if (error) {
          console.error(`[create-updown] Insert error ${symbol} ${duration}m:`, error.message);
        } else {
          created.push(`${symbol} ${duration}m @ ${opensAt.toISOString()} strike=${strikePrice}`);
        }
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, created: created.length, details: created }),
    { headers: { "Content-Type": "application/json" } }
  );
});

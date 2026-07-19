import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const DURATIONS = [5, 15, 30]; // minutes (durée totale du round)
const BINANCE_URL = "https://api.binance.com/api/v3/ticker/price";

// Phase de paris = duration_min, phase live = duration_min aussi (total = 2× duration_min)
// 5min  → 5min paris + 5min live  = 10min total
// 15min → 15min paris + 15min live = 30min total
// 30min → 30min paris + 30min live = 60min total
// Phase de paris
const BETTING_MINUTES: Record<number, number> = {
  5: 5,
  15: 15,
  30: 30,
};
// Durée live (prix en direct après clôture des paris)
const LIVE_MINUTES: Record<number, number> = {
  5: 5,
  15: 15,
  30: 30,
};
// Pause entre la fin du round et le début du suivant (pour parier)
const PAUSE_MINUTES: Record<number, number> = {
  5: 5,
  15: 15,
  30: 30,
};
// Cycle total = betting + live (la pause = écart entre resolve_at et le prochain opens_at)
const TOTAL_MINUTES: Record<number, number> = {
  5: 10,  // 5 betting + 5 live
  15: 30, // 15 betting + 15 live
  30: 60, // 30 betting + 30 live
};
// Intervalle entre deux opens_at = betting + live + pause
const CYCLE_MINUTES: Record<number, number> = {
  5: 15,  // 5 + 5 + 5
  15: 45, // 15 + 15 + 15
  30: 90, // 30 + 30 + 30
};

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = new Date();
  const nowMs = now.getTime();
  const created: string[] = [];
  const errors: string[] = [];

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
      const bettingMs = (BETTING_MINUTES[duration] ?? duration) * 60 * 1000;
      const totalMs   = (TOTAL_MINUTES[duration]   ?? duration * 2) * 60 * 1000;
      const pauseMs   = (PAUSE_MINUTES[duration]   ?? duration) * 60 * 1000;
      const cycleMs   = totalMs + pauseMs; // betting + live + pause

      // Trouve le dernier marché open pour ce symbol+duration
      const { data: openMarket } = await supabase
        .from("updown_markets")
        .select("opens_at, closes_at, resolve_at")
        .eq("symbol", symbol)
        .eq("duration_min", duration)
        .eq("status", "open")
        .order("opens_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Trouve le dernier marché résolu pour chaîner les prochains slots
      const { data: lastResolved } = await supabase
        .from("updown_markets")
        .select("opens_at, resolve_at")
        .eq("symbol", symbol)
        .eq("duration_min", duration)
        .eq("status", "resolved")
        .order("opens_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Calcule l'ancre pour le prochain slot (arrondie à la minute)
      const roundToMinute = (ms: number) => Math.ceil(ms / 60_000) * 60_000;
      let anchorMs: number;
      if (openMarket?.resolve_at) {
        const candidate = new Date(openMarket.resolve_at).getTime() + pauseMs;
        anchorMs = candidate > nowMs ? candidate : roundToMinute(nowMs + 60_000);
      } else if (lastResolved?.resolve_at) {
        const candidate = new Date(lastResolved.resolve_at).getTime() + pauseMs;
        anchorMs = candidate > nowMs ? candidate : roundToMinute(nowMs + 60_000);
      } else {
        anchorMs = roundToMinute(nowMs + 60_000);
      }

      // Crée 2 slots: l'ancre + le suivant
      const slots = [anchorMs, anchorMs + cycleMs];

      for (const slotStart of slots) {
        const opensAt   = new Date(slotStart);
        const closesAt  = new Date(slotStart + bettingMs);
        const resolveAt = new Date(slotStart + totalMs);

        // Skip si opens_at déjà passé
        if (opensAt.getTime() < nowMs) continue;

        // Skip if already fully resolved
        if (resolveAt.getTime() <= nowMs) continue;

        // Check if an active market already covers this slot
        // (open market whose resolve_at is in the future)
        const { data: existing } = await supabase
          .from("updown_markets")
          .select("id")
          .eq("symbol", symbol)
          .eq("duration_min", duration)
          .eq("opens_at", opensAt.toISOString())
          .in("status", ["open"])
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
          errors.push(`${symbol} ${duration}m: ${error.message}`);
        } else {
          created.push(`${symbol} ${duration}m @ ${opensAt.toISOString()} strike=${strikePrice}`);
        }
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, created: created.length, details: created, errors }),
    { headers: { "Content-Type": "application/json" } }
  );
});

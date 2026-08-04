import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "PEPEUSDT", "DOGEUSDT"];
const DURATIONS = [5, 15, 30, 60, 240, 1440];

const TOTAL_MS: Record<number, number> = {
  5: 300_000, 15: 900_000, 30: 1_800_000,
  60: 3_600_000, 240: 14_400_000, 1440: 86_400_000,
};

const STRIKE_DECIMALS: Record<string, number> = {
  BTCUSDT: 2, ETHUSDT: 2, SOLUSDT: 3,
  BNBUSDT: 2, PEPEUSDT: 8, DOGEUSDT: 4,
};

async function fetchTickerPrice(symbol: string): Promise<number> {
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!res.ok) throw new Error(`Binance ticker ${res.status}`);
  const { price } = await res.json() as { price: string };
  const p = parseFloat(price);
  if (isNaN(p) || p <= 0) throw new Error("Invalid ticker price");
  return parseFloat(p.toFixed(STRIKE_DECIMALS[symbol] ?? 2));
}

const roundToMinute = (ms: number) => Math.ceil(ms / 60_000) * 60_000;
const key = (symbol: string, duration: number) => `${symbol}:${duration}`;

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const nowMs = Date.now();
  const created: string[] = [];
  const errors: string[] = [];

  // 1. Fetch all prices in parallel
  const priceMap: Record<string, number> = {};
  await Promise.all(SYMBOLS.map(async (sym) => {
    try {
      priceMap[sym] = await fetchTickerPrice(sym);
    } catch (e) {
      console.error(`[create-updown] price fetch failed ${sym}:`, e);
    }
  }));
  console.log("[create-updown] prices:", JSON.stringify(priceMap));

  // 2. Bulk fetch: all open markets
  const { data: openMarkets } = await supabase
    .from("updown_markets")
    .select("symbol, duration_min, resolve_at")
    .in("symbol", SYMBOLS)
    .in("duration_min", DURATIONS)
    .eq("status", "open")
    .order("opens_at", { ascending: false });

  // Keep only the latest open per symbol+duration
  const openMap: Record<string, string> = {}; // key -> resolve_at
  for (const m of openMarkets ?? []) {
    const k = key(m.symbol, m.duration_min);
    if (!openMap[k]) openMap[k] = m.resolve_at;
  }

  // 3. Bulk fetch: latest resolved per symbol+duration
  const { data: resolvedMarkets } = await supabase
    .from("updown_markets")
    .select("symbol, duration_min, resolve_at, open_price")
    .in("symbol", SYMBOLS)
    .in("duration_min", DURATIONS)
    .eq("status", "resolved")
    .order("opens_at", { ascending: false });

  const resolvedMap: Record<string, { resolve_at: string; open_price: number | null }> = {};
  for (const m of resolvedMarkets ?? []) {
    const k = key(m.symbol, m.duration_min);
    if (!resolvedMap[k]) resolvedMap[k] = { resolve_at: m.resolve_at, open_price: m.open_price };
  }

  // 4. Compute all markets to create
  type NewMarket = {
    symbol: string; duration_min: number; strike_price: number;
    opens_at: string; closes_at: string; resolve_at: string;
    status: string; pool_up: number; pool_down: number; fee_rate: number;
  };

  const toInsert: NewMarket[] = [];

  for (const symbol of SYMBOLS) {
    for (const duration of DURATIONS) {
      const k = key(symbol, duration);
      const totalMs = TOTAL_MS[duration];

      const openResolveAt = openMap[k];
      const lastResolved  = resolvedMap[k];

      let anchorMs: number;
      if (openResolveAt) {
        const end = new Date(openResolveAt).getTime();
        anchorMs = end > nowMs ? end : roundToMinute(nowMs + 60_000);
      } else if (lastResolved?.resolve_at) {
        const end = new Date(lastResolved.resolve_at).getTime();
        anchorMs = end > nowMs ? end : roundToMinute(nowMs + 60_000);
      } else {
        anchorMs = roundToMinute(nowMs + 60_000);
      }

      const opensAt   = new Date(anchorMs);
      const resolveAt = new Date(anchorMs + totalMs);

      if (opensAt.getTime() < nowMs) continue;
      if (resolveAt.getTime() <= nowMs) continue;

      // Strike: chain from prev close, else pre-fetched ticker
      const prevClose =
        lastResolved?.open_price != null &&
        new Date(lastResolved.resolve_at).getTime() === anchorMs
          ? lastResolved.open_price
          : null;

      const strikePrice = prevClose ?? priceMap[symbol];
      if (strikePrice == null) {
        errors.push(`${symbol} ${duration}m: no price`);
        continue;
      }

      toInsert.push({
        symbol, duration_min: duration, strike_price: strikePrice,
        opens_at:   opensAt.toISOString(),
        closes_at:  resolveAt.toISOString(),
        resolve_at: resolveAt.toISOString(),
        status: "open", pool_up: 0, pool_down: 0, fee_rate: 5,
      });
    }
  }

  // 5. Bulk insert with upsert (ignore conflicts on opens_at uniqueness)
  if (toInsert.length > 0) {
    const { data: inserted, error } = await supabase
      .from("updown_markets")
      .upsert(toInsert, {
        onConflict: "symbol,duration_min,opens_at",
        ignoreDuplicates: true,
      })
      .select("symbol, duration_min, opens_at, strike_price");

    if (error) {
      console.error("[create-updown] bulk insert error:", error.message);
      errors.push(`bulk insert: ${error.message}`);
    } else {
      for (const m of inserted ?? []) {
        created.push(`${m.symbol} ${m.duration_min}m @ ${m.opens_at} strike=${m.strike_price}`);
      }
    }
  }

  console.log(`[create-updown] done: ${created.length} created, ${errors.length} errors`);
  return new Response(
    JSON.stringify({ ok: true, created: created.length, details: created, errors }),
    { headers: { "Content-Type": "application/json" } }
  );
});

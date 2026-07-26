import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const DURATIONS = [5, 15, 30]; // minutes (durée totale du round)
const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";

// Modèle Limitless : une seule fenêtre, paris ouverts pendant toute la durée.
// resolve_at = opens_at + duration_min. Pas de pause, pas de phase séparée.
const TOTAL_MINUTES: Record<number, number> = { 5: 5, 15: 15, 30: 30 };

// Précision d'arrondi du strike par asset (décimales)
const STRIKE_DECIMALS: Record<string, number> = {
  BTCUSDT: 2,
  ETHUSDT: 2,
  SOLUSDT: 3,
};

/**
 * S-01 + S-03 FIX: le strike = close de la bougie 1min Binance qui se termine
 * juste AVANT opens_at. Même source que la résolution → cohérence garantie.
 *
 * S-06 FIX: retry 3× avec backoff si Binance est down.
 * S-07 FIX: arrondi normalisé selon l'asset.
 */
async function fetchStrikePrice(symbol: string, opensAtMs: number): Promise<number> {
  // La bougie 1min qui se TERMINE avant opens_at commence à :
  //   floor(opensAt / 60000) * 60000 - 60000
  // Son closeTime = candleStart + 60000 - 1ms ≤ opensAt
  const candleStart = Math.floor(opensAtMs / 60_000) * 60_000 - 60_000;
  const url = `${BINANCE_KLINES_URL}?symbol=${symbol}&interval=1m&startTime=${candleStart}&endTime=${candleStart + 60_000}&limit=1`;

  const decimals = STRIKE_DECIMALS[symbol] ?? 2;

  // S-06: retry 3×
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`Binance klines ${res.status}`);
      const klines: [number, string, string, string, string, ...unknown[]][] = await res.json();
      if (!Array.isArray(klines) || klines.length === 0) throw new Error("No kline data");
      const closePrice = parseFloat(klines[0][4]);
      if (isNaN(closePrice) || closePrice <= 0) throw new Error("Invalid close price");
      // S-07: normaliser la précision
      return parseFloat(closePrice.toFixed(decimals));
    } catch (e) {
      console.warn(`[create-updown] Strike fetch attempt ${attempt + 1}/3 failed for ${symbol}:`, e);
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  // Dernier recours: ticker/price (fallback uniquement si klines indisponibles)
  console.warn(`[create-updown] Falling back to ticker/price for ${symbol}`);
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!res.ok) throw new Error(`Binance ticker ${res.status}`);
  const data: { price: string } = await res.json();
  const price = parseFloat(data.price);
  if (isNaN(price) || price <= 0) throw new Error("Invalid ticker price");
  return parseFloat(price.toFixed(decimals));
}

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
    for (const duration of DURATIONS) {
      const totalMs = TOTAL_MINUTES[duration] * 60 * 1000;

      // Trouve le dernier marché open pour ce symbol+duration
      const { data: openMarket } = await supabase
        .from("updown_markets")
        .select("resolve_at")
        .eq("symbol", symbol)
        .eq("duration_min", duration)
        .eq("status", "open")
        .order("opens_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Trouve le dernier marché résolu pour chaîner le strike
      const { data: lastResolved } = await supabase
        .from("updown_markets")
        .select("resolve_at, open_price")
        .eq("symbol", symbol)
        .eq("duration_min", duration)
        .eq("status", "resolved")
        .order("opens_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Ancre = fin du round en cours, ou prochaine minute ronde si rien
      const roundToMinute = (ms: number) => Math.ceil(ms / 60_000) * 60_000;
      let anchorMs: number;
      if (openMarket?.resolve_at) {
        const end = new Date(openMarket.resolve_at).getTime();
        anchorMs = end > nowMs ? end : roundToMinute(nowMs + 60_000);
      } else if (lastResolved?.resolve_at) {
        const end = new Date(lastResolved.resolve_at).getTime();
        anchorMs = end > nowMs ? end : roundToMinute(nowMs + 60_000);
      } else {
        anchorMs = roundToMinute(nowMs + 60_000);
      }

      const opensAt   = new Date(anchorMs);
      const resolveAt = new Date(anchorMs + totalMs);
      const closesAt  = resolveAt; // closes_at = resolve_at (Limitless)

      // Skip si opens_at déjà passé
      if (opensAt.getTime() < nowMs) continue;

      // Skip if already fully resolved
      if (resolveAt.getTime() <= nowMs) continue;

      // BUG-UD-1 FIX: vérifier TOUS les statuts, pas seulement "open".
      const { data: existing } = await supabase
        .from("updown_markets")
        .select("id")
        .eq("symbol", symbol)
        .eq("duration_min", duration)
        .eq("opens_at", opensAt.toISOString())
        .in("status", ["open", "resolved", "cancelled"])
        .maybeSingle();

      if (existing) continue;

      // Strike price: si le round précédent est résolu ET que son resolve_at correspond
      // à l'opens_at du nouveau round, utiliser son open_price (prix de clôture de résolution).
      // C'est la source canonique : résolution écrit ce prix → strike suivant = ce prix.
      // Fallback: klines 1min Binance juste avant opens_at (premier round ou après gap).
      let strikePrice: number;
      const prevClosePrice =
        lastResolved?.open_price != null &&
        lastResolved.resolve_at != null &&
        new Date(lastResolved.resolve_at).getTime() === opensAt.getTime()
          ? (lastResolved.open_price as number)
          : null;

      if (prevClosePrice != null) {
        strikePrice = prevClosePrice;
        console.log(`[create-updown] ${symbol} ${duration}m: using prev close price ${strikePrice} as strike`);
      } else {
        try {
          strikePrice = await fetchStrikePrice(symbol, opensAt.getTime());
        } catch (e) {
          console.error(`[create-updown] Cannot fetch strike for ${symbol} ${duration}m:`, e);
          errors.push(`${symbol} ${duration}m: strike fetch failed — ${e}`);
          continue;
        }
      }

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

  return new Response(
    JSON.stringify({ ok: true, created: created.length, details: created, errors }),
    { headers: { "Content-Type": "application/json" } }
  );
});

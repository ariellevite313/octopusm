import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";

/**
 * S-02 FIX: utilise la bougie 1min qui se TERMINE avant resolve_at.
 * candleStart = floor(resolveAt/60000)*60000 - 60000
 * → son closeTime = candleStart + 60000 - 1ms ≤ resolveAt
 * Avant: on prenait la bougie qui COUVRE resolve_at → jusqu'à 60s de décalage.
 *
 * S-04 FIX: le résolveur attend 30s après resolve_at avant de fetcher les klines.
 * Binance publie les bougie avec ~5-10s de délai; 30s de marge évite le fallback
 * temps réel qui causerait une résolution incohérente.
 *
 * Retry 3× avec backoff pour absorber les pics de latence Binance.
 */
async function getHistoricalClosePrice(symbol: string, resolveAtMs: number): Promise<number> {
  // S-02: bougie qui se TERMINE avant resolve_at
  const candleStart = Math.floor(resolveAtMs / 60_000) * 60_000 - 60_000;
  const url = `${BINANCE_KLINES_URL}?symbol=${symbol}&interval=1m&startTime=${candleStart}&endTime=${candleStart + 60_000}&limit=1`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Binance klines ${res.status}`);
      const klines: any[] = await res.json();
      if (!klines || klines.length === 0) throw new Error("No kline data returned");
      // kline format: [openTime, open, high, low, close, volume, ...]
      const closePrice = parseFloat(klines[0][4]);
      if (isNaN(closePrice) || closePrice <= 0) throw new Error("Invalid close price from kline");
      return closePrice;
    } catch (e) {
      console.warn(`[resolve-updown] getHistoricalClosePrice attempt ${attempt + 1}/3:`, e);
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error("All kline fetch attempts failed");
}

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // S-04 FIX: on ne résout que les marchés dont resolve_at a passé depuis ≥ 30s.
  // Binance publie les klines 1min avec 5-10s de délai — 30s de marge évite
  // le fallback sur le prix temps réel qui rendrait la résolution incohérente avec le strike.
  const RESOLVE_DELAY_MS = 30_000;
  const resolveThreshold = new Date(Date.now() - RESOLVE_DELAY_MS).toISOString();

  // Find all open markets whose resolve_at has passed (+ délai 30s)
  const { data: expired, error: fetchErr } = await supabase
    .from("updown_markets")
    .select("*")
    .eq("status", "open")
    .lte("resolve_at", resolveThreshold);

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
  }

  if (!expired || expired.length === 0) {
    return new Response(JSON.stringify({ ok: true, resolved: 0 }));
  }

  const resolved: string[] = [];
  const errors:   string[] = [];

  for (const market of expired) {
    // TIMING #5 FIX: Mise à jour atomique avec garde sur status='open'
    // Si deux cron s'exécutent en parallèle, un seul passera ce UPDATE.
    const resolveAtMs = new Date(market.resolve_at).getTime();

    // Fetch close price historique à resolve_at via klines 1min (S-02/S-04 FIX)
    let closePrice: number;
    try {
      closePrice = await getHistoricalClosePrice(market.symbol, resolveAtMs);
    } catch (e) {
      console.error(`[resolve-updown] Historical price fetch failed for ${market.symbol}:`, e);
      // S-04 FIX: on ne tombe plus sur le prix temps réel — il est différent du strike
      // (strike = kline close, résolution doit aussi = kline close).
      // Si les klines sont indisponibles malgré le délai 30s → annuler ce marché.
      await supabase
        .from("updown_markets")
        .update({ status: "cancelled" })
        .eq("id", market.id)
        .eq("status", "open"); // garde atomique
      await supabase
        .from("updown_bets")
        .update({ status: "refunded" })
        .eq("market_id", market.id)
        .in("status", ["pending", "approved"]);
      errors.push(`${market.symbol} ${market.duration_min}m: kline fetch failed, market cancelled`);
      continue;
    }

    // Determine outcome
    const outcome =
      closePrice > market.strike_price ? "up" :
      closePrice < market.strike_price ? "down" : null; // null = tie

    if (!outcome) {
      // Tie — atomic guard: seulement si encore 'open'
      const { data: tieUpdated } = await supabase
        .from("updown_markets")
        .update({ status: "cancelled", open_price: closePrice })
        .eq("id", market.id)
        .eq("status", "open") // TIMING #5 FIX
        .select("id");

      if (!tieUpdated || tieUpdated.length === 0) {
        console.log(`[resolve-updown] Market ${market.id} already processed by another execution (tie)`);
        continue;
      }

      await supabase
        .from("updown_bets")
        .update({ status: "refunded" })
        .eq("market_id", market.id)
        .in("status", ["pending", "approved"]);

      resolved.push(`${market.symbol} ${market.duration_min}m → TIE (refunded)`);
      continue;
    }

    // BUG-UD-5 FIX: détecter le cas one-sided AVANT l'update atomique "resolved".
    // Si on mettait "resolved" puis "cancelled", le marché resterait avec outcome écrit
    // et un status incohérent. On annule directement avec la garde atomique.
    const poolWinners = outcome === "up" ? Number(market.pool_up) : Number(market.pool_down);
    const poolLosers  = outcome === "up" ? Number(market.pool_down) : Number(market.pool_up);

    if (poolLosers === 0) {
      const { data: oneSidedUpdated } = await supabase
        .from("updown_markets")
        .update({ status: "cancelled", open_price: closePrice })
        .eq("id", market.id)
        .eq("status", "open") // garde atomique
        .select("id");

      if (!oneSidedUpdated || oneSidedUpdated.length === 0) {
        console.log(`[resolve-updown] Market ${market.id} already processed (one-sided check)`);
        continue;
      }

      await supabase
        .from("updown_bets")
        .update({ status: "refunded" })
        .eq("market_id", market.id)
        .in("status", ["pending", "approved"]);

      resolved.push(`${market.symbol} ${market.duration_min}m → ${outcome} (one-sided, refunded)`);
      continue;
    }

    // TIMING #5 FIX: Atomic market update — vérifier rows_affected avant de traiter les paris
    // Si un autre processus a déjà résolu ce marché, on skip complètement.
    const { data: atomicUpdated, error: atomicErr } = await supabase
      .from("updown_markets")
      .update({ status: "resolved", outcome, open_price: closePrice })
      .eq("id", market.id)
      .eq("status", "open") // garde: seulement si encore 'open'
      .select("id");

    if (atomicErr) {
      console.error(`[resolve-updown] Atomic update error for ${market.id}:`, atomicErr.message);
      continue;
    }
    if (!atomicUpdated || atomicUpdated.length === 0) {
      // Déjà résolu par une autre exécution concurrente → skip pour éviter double-payout
      console.log(`[resolve-updown] Market ${market.id} already processed by another execution — skipping`);
      continue;
    }

    // Calculate payouts (seulement si on a gagné le verrou atomique)
    const totalPool = poolWinners + poolLosers;
    const feeRate   = Number(market.fee_rate) / 100;
    const netPool   = totalPool * (1 - feeRate);

    // Get all bets for this market
    const { data: bets } = await supabase
      .from("updown_bets")
      .select("*")
      .eq("market_id", market.id)
      .in("status", ["pending", "approved"]);

    if (!bets || bets.length === 0) {
      resolved.push(`${market.symbol} ${market.duration_min}m → ${outcome} (no bets)`);
      continue;
    }

    // Update each bet
    for (const bet of bets) {
      const isWinner = bet.direction === outcome;
      const betAmount = Number(bet.amount);

      let payout = 0;
      if (isWinner && poolWinners > 0) {
        payout = (betAmount / poolWinners) * netPool;
        payout = Math.round(payout * 1_000_000) / 1_000_000; // 6 decimals USDC
      }

      await supabase
        .from("updown_bets")
        .update({
          status: isWinner ? "won" : "lost",
          payout: isWinner ? payout : 0,
        })
        .eq("id", bet.id);
    }

    resolved.push(
      `${market.symbol} ${market.duration_min}m → ${outcome} | strike=${market.strike_price} close=${closePrice} | pool_up=${market.pool_up} pool_down=${market.pool_down}`
    );
  }

  return new Response(
    JSON.stringify({ ok: true, resolved: resolved.length, details: resolved, errors }),
    { headers: { "Content-Type": "application/json" } }
  );
});

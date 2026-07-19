import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";

/**
 * Récupère le prix de clôture historique à un timestamp donné via Binance klines.
 * Utilise la bougie 1m qui couvre resolve_at.
 * BUG #9 FIX: ne plus utiliser le prix temps réel.
 */
async function getHistoricalClosePrice(symbol: string, resolveAtMs: number): Promise<number> {
  // La bougie 1m qui contient resolveAt commence à : floor(resolveAt / 60000) * 60000
  const candleStart = Math.floor(resolveAtMs / 60_000) * 60_000;
  const url = `${BINANCE_KLINES_URL}?symbol=${symbol}&interval=1m&startTime=${candleStart}&endTime=${candleStart + 60_000}&limit=1`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Binance klines ${res.status}`);
  const klines: any[] = await res.json();
  if (!klines || klines.length === 0) throw new Error("No kline data returned");

  // kline format: [openTime, open, high, low, close, volume, ...]
  const closePrice = parseFloat(klines[0][4]);
  if (isNaN(closePrice)) throw new Error("Invalid close price from kline");
  return closePrice;
}

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = new Date().toISOString();

  // Find all open markets whose resolve_at has passed
  const { data: expired, error: fetchErr } = await supabase
    .from("updown_markets")
    .select("*")
    .eq("status", "open")
    .lte("resolve_at", now);

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
  }

  if (!expired || expired.length === 0) {
    return new Response(JSON.stringify({ ok: true, resolved: 0 }));
  }

  const resolved: string[] = [];

  for (const market of expired) {
    // TIMING #5 FIX: Mise à jour atomique avec garde sur status='open'
    // Si deux cron s'exécutent en parallèle, un seul passera ce UPDATE.
    const resolveAtMs = new Date(market.resolve_at).getTime();

    // Fetch close price historique à resolve_at (BUG #9 FIX)
    let closePrice: number;
    try {
      closePrice = await getHistoricalClosePrice(market.symbol, resolveAtMs);
    } catch (e) {
      console.error(`[resolve-updown] Historical price fetch failed for ${market.symbol}:`, e);
      // Fallback: tenter le prix temps réel si les klines ne sont pas encore disponibles
      // (peut arriver si resolve_at est très récent, <2min)
      try {
        const fallback = await fetch(
          `https://api.binance.com/api/v3/ticker/price?symbol=${market.symbol}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!fallback.ok) throw new Error(`Fallback ${fallback.status}`);
        const data: { price: string } = await fallback.json();
        closePrice = parseFloat(data.price);
        console.warn(`[resolve-updown] Using real-time fallback price for ${market.symbol}: ${closePrice}`);
      } catch {
        // Aucun prix disponible → annuler ce marché
        await supabase
          .from("updown_markets")
          .update({ status: "cancelled" })
          .eq("id", market.id)
          .eq("status", "open"); // garde atomique
        continue;
      }
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
    const poolWinners = outcome === "up" ? Number(market.pool_up) : Number(market.pool_down);
    const poolLosers  = outcome === "up" ? Number(market.pool_down) : Number(market.pool_up);
    const totalPool   = poolWinners + poolLosers;
    const feeRate     = Number(market.fee_rate) / 100;
    const netPool     = totalPool * (1 - feeRate);

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

    // Si tout le monde est du même côté (poolLosers = 0) → refund
    if (poolLosers === 0) {
      await supabase
        .from("updown_markets")
        .update({ status: "cancelled", open_price: closePrice })
        .eq("id", market.id);

      await supabase
        .from("updown_bets")
        .update({ status: "refunded" })
        .eq("market_id", market.id)
        .in("status", ["pending", "approved"]);

      resolved.push(`${market.symbol} ${market.duration_min}m → ${outcome} (one-sided, refunded)`);
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
    JSON.stringify({ ok: true, resolved: resolved.length, details: resolved }),
    { headers: { "Content-Type": "application/json" } }
  );
});

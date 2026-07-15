import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BINANCE_URL = "https://api.binance.com/api/v3/ticker/price";

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = new Date().toISOString();

  // Find all open markets that have expired
  const { data: expired, error: fetchErr } = await supabase
    .from("updown_markets")
    .select("*")
    .eq("status", "open")
    .lte("closes_at", now);

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
  }

  if (!expired || expired.length === 0) {
    return new Response(JSON.stringify({ ok: true, resolved: 0 }));
  }

  const resolved: string[] = [];

  for (const market of expired) {
    // Fetch close price from Binance
    let closePrice: number;
    try {
      const res = await fetch(`${BINANCE_URL}?symbol=${market.symbol}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Binance ${res.status}`);
      const data: { price: string } = await res.json();
      closePrice = parseFloat(data.price);
    } catch (e) {
      console.error(`[resolve-updown] Price fetch failed for ${market.symbol}:`, e);
      // Mark as cancelled if price unavailable
      await supabase
        .from("updown_markets")
        .update({ status: "cancelled" })
        .eq("id", market.id);
      continue;
    }

    // Determine outcome
    const outcome =
      closePrice > market.strike_price ? "up" :
      closePrice < market.strike_price ? "down" : null; // null = tie

    if (!outcome) {
      // Tie — refund everyone
      await supabase
        .from("updown_markets")
        .update({ status: "cancelled", open_price: closePrice })
        .eq("id", market.id);

      await supabase
        .from("updown_bets")
        .update({ status: "refunded" })
        .eq("market_id", market.id)
        .in("status", ["pending", "approved"]);

      resolved.push(`${market.symbol} ${market.duration_min}m → TIE (refunded)`);
      continue;
    }

    // Calculate payouts
    const poolWinners = outcome === "up" ? Number(market.pool_up) : Number(market.pool_down);
    const poolLosers  = outcome === "up" ? Number(market.pool_down) : Number(market.pool_up);
    const totalPool   = poolWinners + poolLosers;
    const feeRate     = Number(market.fee_rate) / 100;
    const netPool     = totalPool * (1 - feeRate);

    // Update market
    await supabase
      .from("updown_markets")
      .update({ status: "resolved", outcome, open_price: closePrice })
      .eq("id", market.id);

    // Get all bets for this market (pending ET approved — les deux comptent)
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
        // Proportional share of net pool
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

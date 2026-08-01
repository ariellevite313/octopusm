import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type TrendingMarket = {
  id: string;
  type: "pool" | "updown" | "prediction";
  title: string;
  category: string;
  href: string;
  /** Image representing the market subject (not the category) */
  img?: string;
  /** Total volume used for sorting. For CLT-only pools this is total_pool_clt. */
  volume_usdc: number;
  /** Token used to label the volume ("usdc" | "clawdtrust") */
  bet_token: "usdc" | "clawdtrust";
  bet_count: number;
  options: { id: string; label: string; pct: number }[];
  // updown only
  symbol?: string;
  strike_price?: number;
  closes_at?: string;
};

const MIN_MARKETS = 3;
const MAX_RESULTS = 8;

const SYMBOL_IMAGES: Record<string, string> = {
  BTCUSDT:  "/bitcoin.png",
  ETHUSDT:  "/ethereum.png",
  SOLUSDT:  "/solana.png",
  BNBUSDT:  "/bnb.png",
  PEPEUSDT: "/pepe.png",
  DOGEUSDT: "/doge.png",
};

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;

  // ── 1. Pool markets with volume (USDC or CLT) ─────────────────────────────
  const { data: rawPools } = await sb
    .from("mutuel_markets")
    .select("id, slug, title, category, options, cover_image_src, total_pool_usdc, total_pool_clt, bet_count, bet_token")
    .eq("status", "active")
    .or("total_pool_usdc.gt.0,total_pool_clt.gt.0")
    .order("total_pool_usdc", { ascending: false })
    .limit(10);

  const pools = (rawPools ?? []) as any[];

  // ── 2. Updown markets (open, has bets) ────────────────────────────────────
  const { data: rawUpdown } = await sb
    .from("updown_markets")
    .select("id, symbol, strike_price, pool_up, pool_down, duration_min, closes_at, status")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(10);

  const updowns = ((rawUpdown ?? []) as any[]).filter(
    (m: any) => Number(m.pool_up) + Number(m.pool_down) > 0
  );

  // ── 3. Prediction markets with volume (all tokens) ────────────────────────
  const { data: rawPredHistory } = await sb
    .from("prediction_history")
    .select("market_id, selection_id, token, total_charged");

  // Aggregate volumes by market / selection
  const predBySelection: Record<string, Record<string, number>> = {};
  const predTotalVol: Record<string, number> = {};

  for (const row of (rawPredHistory ?? []) as any[]) {
    if (!predBySelection[row.market_id]) predBySelection[row.market_id] = {};
    predBySelection[row.market_id][row.selection_id] =
      (predBySelection[row.market_id][row.selection_id] ?? 0) + Number(row.total_charged);
    predTotalVol[row.market_id] =
      (predTotalVol[row.market_id] ?? 0) + Number(row.total_charged);
  }

  const topPredIds = Object.entries(predTotalVol)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id]) => id);

  const { data: rawPreds } = topPredIds.length > 0
    ? await sb
        .from("prediction_markets")
        .select("id, slug, title, category_id, options, single_image_src, left_competitor_image_src")
        .in("id", topPredIds)
        .eq("is_active", true)
        .eq("is_resolved", false)
    : { data: [] };

  const preds = (rawPreds ?? []) as any[];

  // ── 4. Bet amounts per option for pool markets (for percentages) ───────────
  const poolIds = pools.map((p: any) => p.id);
  const { data: rawBets } = poolIds.length > 0
    ? await sb
        .from("mutuel_bets")
        .select("market_id, option_id, amount")
        .in("market_id", poolIds)
        .eq("status", "approved")
    : { data: [] };

  const betsByMarket: Record<string, Record<string, number>> = {};
  for (const b of (rawBets ?? []) as any[]) {
    if (!betsByMarket[b.market_id]) betsByMarket[b.market_id] = {};
    betsByMarket[b.market_id][b.option_id] =
      (betsByMarket[b.market_id][b.option_id] ?? 0) + Number(b.amount);
  }

  // ── 5. Build unified items ─────────────────────────────────────────────────
  const items: TrendingMarket[] = [];

  // Pools
  for (const p of pools) {
    const rawOpts = typeof p.options === "string"
      ? JSON.parse(p.options)
      : (p.options ?? []);
    const optAmounts = betsByMarket[p.id] ?? {};
    const totalBet = Object.values(optAmounts).reduce(
      (s: number, v: any) => s + Number(v), 0
    );
    const fallbackPct = rawOpts.length > 0
      ? Math.round(100 / rawOpts.length)
      : 50;

    const options = rawOpts.slice(0, 2).map((o: any) => ({
      id: String(o.id ?? o.label),
      label: String(o.label),
      pct: totalBet > 0
        ? Math.round((optAmounts[String(o.id ?? o.label)] ?? 0) / totalBet * 100)
        : fallbackPct,
    }));

    const usdcVol = Number(p.total_pool_usdc);
    const cltVol  = Number(p.total_pool_clt);
    // Sort by USDC first, but CLT-only pools also qualify
    const volume  = usdcVol > 0 ? usdcVol : cltVol;
    const token   = (p.bet_token === "clawdtrust" || (usdcVol === 0 && cltVol > 0))
      ? "clawdtrust"
      : "usdc";

    items.push({
      id: p.id,
      type: "pool",
      title: p.title,
      category: p.category ?? "other",
      href: `/pools/${p.slug}`,
      img: p.cover_image_src ?? undefined,
      volume_usdc: volume,
      bet_token: token,
      bet_count: Number(p.bet_count),
      options,
    });
  }

  // Updown
  for (const u of updowns) {
    const poolUp   = Number(u.pool_up);
    const poolDown = Number(u.pool_down);
    const total    = poolUp + poolDown;
    const upPct    = total > 0 ? Math.round((poolUp / total) * 100) : 50;
    const sym      = String(u.symbol ?? "");
    const label    = sym.replace("USDT", "").replace("USDC", "");

    items.push({
      id: u.id,
      type: "updown",
      title: `${label} Up/Down`,
      category: "crypto",
      href: `/crypto/${u.id}`,
      img: SYMBOL_IMAGES[sym],
      volume_usdc: total,
      bet_token: "usdc",
      bet_count: 0,
      options: [
        { id: "up",   label: "UP ↑",   pct: upPct },
        { id: "down", label: "DOWN ↓", pct: 100 - upPct },
      ],
      symbol: sym,
      strike_price: Number(u.strike_price),
      closes_at: u.closes_at,
    });
  }

  // Prediction
  for (const p of preds) {
    const rawOpts = typeof p.options === "string"
      ? JSON.parse(p.options)
      : (p.options ?? []);
    const volByOpt  = predBySelection[p.id] ?? {};
    const totalVol  = predTotalVol[p.id] ?? 0;
    const fallbackPct = rawOpts.length > 0
      ? Math.round(100 / rawOpts.length)
      : 50;

    const options = rawOpts.slice(0, 2).map((o: any) => ({
      id: String(o.id),
      label: String(o.label),
      pct: totalVol > 0
        ? Math.round((volByOpt[String(o.id)] ?? 0) / totalVol * 100)
        : fallbackPct,
    }));

    items.push({
      id: p.id,
      type: "prediction",
      title: p.title,
      category: p.category_id ?? "other",
      href: `/market/${p.slug ?? p.id}`,
      img: p.single_image_src ?? p.left_competitor_image_src ?? undefined,
      volume_usdc: totalVol,
      bet_token: "usdc",
      bet_count: 0,
      options,
    });
  }

  // ── 6. Sort, filter, return ────────────────────────────────────────────────
  items.sort((a, b) => b.volume_usdc - a.volume_usdc);

  const withVolume = items.filter((i) => i.volume_usdc > 0);
  if (withVolume.length < MIN_MARKETS) {
    return NextResponse.json([], {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
    });
  }

  return NextResponse.json(items.slice(0, MAX_RESULTS), {
    headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
  });
}

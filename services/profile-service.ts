import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublicProfileWallet {
  address: string;
  display_name: string | null;
  avatar_src: string | null;
  twitter_handle: string | null;
  created_at: string | null;
}

export interface PublicProfileStats {
  rank: number | null;
  total_rounds: number;
  win_count: number;
  win_rate: number; // 0-100
  octo_balance: number;
}

export interface PublicProfileVolume {
  usdc: number;
  clt: number;
}

export interface PnlPoint {
  date: string; // "YYYY-MM-DD"
  usdc: number; // cumulative P&L USDC
  clt: number;  // cumulative P&L CLT
}

export interface ActivityItem {
  id: string;
  market_type: "updown" | "pool" | "prediction";
  label: string;        // e.g. "BTC · 5m" or market title
  direction_badge: string | null; // "UP" | "DOWN" | null
  token: "usdc" | "clt";
  amount: number;       // original stake (for display when pnl = 0)
  pnl: number;          // signed gain/loss (0 if pending/active)
  status: string;       // "won" | "lost" | "refunded" | "pending" | "approved" etc.
  created_at: string;
}

export interface CreatedMarket {
  id: string;
  title: string;
  status: string;       // "pending" | "open" | "resolved" | "cancelled"
  cover_image_src: string | null;
  bet_token: "usdc" | "clawdtrust";
  volume: number;
  bet_count: number;
  winning_option_label: string | null;
  fee_earned: number;   // 1% of volume
  created_at: string;
  options: { id: string; label: string }[];
}

export interface PublicProfileData {
  wallet: PublicProfileWallet | null;
  stats: PublicProfileStats;
  volume: PublicProfileVolume;
  pnl_series: PnlPoint[];   // all time, daily
  activity: ActivityItem[];  // last 200
  created_markets: CreatedMarket[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDate(iso: string): string {
  return iso.slice(0, 10);
}

// ─── Core function ────────────────────────────────────────────────────────────

async function _getPublicProfile(walletAddress: string): Promise<PublicProfileData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const [
    walletRes,
    rankRes,
    updownBetsRes,
    mutuelBetsRes,
    predBetsRes,
    createdMarketsRes,
    updownCountRes,
    mutuelCountRes,
    predCountRes,
  ] = await Promise.all([
    // Wallet info
    admin
      .from("wallets")
      .select("address, display_name, avatar_src, twitter_handle, created_at")
      .eq("address", walletAddress)
      .maybeSingle(),

    // OCTO total from leaderboard (includes total_octo used for balance + rank)
    admin
      .from("leaderboard_octo")
      .select("total_octo")
      .eq("wallet_address", walletAddress)
      .maybeSingle(),

    // Up/Down bets — for P&L computation + activity display
    admin
      .from("updown_bets")
      .select("id, direction, amount, payout, status, created_at, updown_markets(symbol, duration_min)")
      .eq("wallet_address", walletAddress)
      .order("created_at", { ascending: false })
      .limit(500),

    // Mutuel pool bets (non-creator-fee rows)
    admin
      .from("mutuel_bets")
      .select("id, amount, token, option_id, payout_amount, status, created_at, mutuel_markets(id, title, winning_option_id, status, options, is_refund)")
      .eq("wallet_address", walletAddress)
      .neq("status", "creator_fee")
      .order("created_at", { ascending: false })
      .limit(500),

    // Prediction bets
    admin
      .from("prediction_history_with_status")
      .select("id, market_title, token, amount, net_reward, result_status, created_at")
      .eq("wallet_address", walletAddress)
      .order("created_at", { ascending: false })
      .limit(500),

    // Markets created (mutuel only for now)
    admin
      .from("mutuel_markets")
      .select("id, title, status, cover_image_src, bet_token, total_pool_usdc, total_pool_clt, bet_count, winning_option_id, resolved_at, created_at, options")
      .eq("creator_wallet", walletAddress)
      .order("created_at", { ascending: false })
      .limit(50),

    // Accurate total counts (HEAD queries — no row data transfer)
    admin
      .from("updown_bets")
      .select("*", { count: "exact", head: true })
      .eq("wallet_address", walletAddress),

    admin
      .from("mutuel_bets")
      .select("*", { count: "exact", head: true })
      .eq("wallet_address", walletAddress)
      .neq("status", "creator_fee"),

    admin
      .from("prediction_history_with_status")
      .select("*", { count: "exact", head: true })
      .eq("wallet_address", walletAddress),
  ]);

  // ── Error logging ─────────────────────────────────────────────────────────
  if (walletRes.error)         console.error("[profile] wallets:", walletRes.error.message);
  if (rankRes.error)           console.error("[profile] leaderboard_octo:", rankRes.error.message);
  if (updownBetsRes.error)     console.error("[profile] updown_bets:", updownBetsRes.error.message);
  if (mutuelBetsRes.error)     console.error("[profile] mutuel_bets:", mutuelBetsRes.error.message);
  if (predBetsRes.error)       console.error("[profile] prediction_history:", predBetsRes.error.message);
  if (createdMarketsRes.error) console.error("[profile] mutuel_markets:", createdMarketsRes.error.message);
  if (updownCountRes.error)    console.error("[profile] updown_count:", updownCountRes.error.message);
  if (mutuelCountRes.error)    console.error("[profile] mutuel_count:", mutuelCountRes.error.message);
  if (predCountRes.error)      console.error("[profile] pred_count:", predCountRes.error.message);

  // ── Wallet ────────────────────────────────────────────────────────────────
  const wallet: PublicProfileWallet | null = walletRes.data
    ? {
        address:        walletRes.data.address,
        display_name:   walletRes.data.display_name ?? null,
        avatar_src:     walletRes.data.avatar_src ?? null,
        twitter_handle: walletRes.data.twitter_handle ?? null,
        created_at:     walletRes.data.created_at ?? null,
      }
    : null;

  // ── OCTO balance — use precomputed total from leaderboard (no extra query) ──
  const octoBalance = Number(rankRes.data?.total_octo ?? 0);

  // ── Rank — sequential after rankRes (requires knowing user's total first) ──
  let rank: number | null = null;
  if (octoBalance > 0) {
    const { count } = await admin
      .from("leaderboard_octo")
      .select("*", { count: "exact", head: true })
      .gt("total_octo", octoBalance);
    rank = (count ?? 0) + 1;
  }

  // ── Raw bet arrays ────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updownBets: any[] = updownBetsRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutuelBets: any[] = mutuelBetsRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const predBets:   any[] = predBetsRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createdRaw: any[] = createdMarketsRes.data ?? [];

  // ── Total rounds — accurate counts from DB (not limited by fetch limit) ───
  const total_rounds =
    (updownCountRes.count ?? 0) +
    (mutuelCountRes.count  ?? 0) +
    (predCountRes.count    ?? 0);

  // ── Stats ──────────────────────────────────────────────────────────────────
  let winCount    = 0;
  let totalSettled = 0;

  for (const b of updownBets) {
    if (["won", "claimed", "paid"].includes(b.status)) { winCount++; totalSettled++; }
    else if (b.status === "lost") { totalSettled++; }
  }
  for (const b of mutuelBets) {
    const mbMarket = b.mutuel_markets;
    const mbPay    = Number(b.payout_amount ?? 0);
    const mbIsWin  = mbPay > 0;
    const mbIsLoss = mbMarket?.status === "resolved" && !mbIsWin
                     && mbMarket?.winning_option_id
                     && b.option_id !== mbMarket.winning_option_id;
    if (mbIsWin)        { winCount++; totalSettled++; }
    else if (mbIsLoss)  { totalSettled++; }
  }
  for (const b of predBets) {
    if (["win", "claimed", "paid"].includes(b.result_status)) { winCount++; totalSettled++; }
    else if (b.result_status === "lose") { totalSettled++; }
  }

  const win_rate = totalSettled > 0 ? Math.round((winCount / totalSettled) * 100) : 0;

  // ── Volume ────────────────────────────────────────────────────────────────
  let volumeUsdc = 0;
  let volumeClt  = 0;

  for (const b of updownBets) {
    volumeUsdc += Number(b.amount ?? 0); // updown_bets is always USDC
  }
  for (const b of mutuelBets) {
    const amt = Number(b.amount ?? 0);
    if (b.token === "usdc") volumeUsdc += amt;
    else volumeClt += amt;
  }
  for (const b of predBets) {
    const amt = Number(b.amount ?? 0);
    if (b.token === "clawdtrust" || b.token === "clt") volumeClt += amt;
    else volumeUsdc += amt;
  }

  // ── P&L daily series ──────────────────────────────────────────────────────
  const dailyUsdc: Record<string, number> = {};
  const dailyClt:  Record<string, number> = {};

  function addDelta(date: string, token: string, pnl: number) {
    if (token === "usdc") {
      dailyUsdc[date] = (dailyUsdc[date] ?? 0) + pnl;
    } else {
      dailyClt[date] = (dailyClt[date] ?? 0) + pnl;
    }
  }

  for (const b of updownBets) {
    const date = toDate(b.created_at);
    const amt  = Number(b.amount ?? 0);
    const pay  = Number(b.payout ?? 0);
    const pnl  = ["won", "claimed", "paid"].includes(b.status) ? pay - amt
               : b.status === "lost" ? -amt
               : 0;
    addDelta(date, "usdc", pnl);
  }

  for (const b of mutuelBets) {
    const date   = toDate(b.created_at);
    const amt    = Number(b.amount ?? 0);
    const pay    = Number(b.payout_amount ?? 0);
    const market = b.mutuel_markets;
    const isWinner = pay > 0;
    const isLoser  = market?.status === "resolved" && !isWinner
                     && market?.winning_option_id && b.option_id !== market.winning_option_id;
    const pnl = isWinner ? pay - amt : isLoser ? -amt : 0;
    addDelta(date, b.token ?? "usdc", pnl);
  }

  for (const b of predBets) {
    const date   = toDate(b.created_at);
    const amt    = Number(b.amount ?? 0);
    const reward = Number(b.net_reward ?? 0);
    const pnl    = ["win", "claimed", "paid"].includes(b.result_status) ? reward
                 : b.result_status === "lose" ? -amt
                 : 0;
    addDelta(date, b.token ?? "usdc", pnl);
  }

  const allDates = Array.from(
    new Set([...Object.keys(dailyUsdc), ...Object.keys(dailyClt)])
  ).sort();

  const pnl_series: PnlPoint[] = [];
  let cumUsdc = 0;
  let cumClt  = 0;
  for (const date of allDates) {
    cumUsdc += dailyUsdc[date] ?? 0;
    cumClt  += dailyClt[date]  ?? 0;
    pnl_series.push({ date, usdc: cumUsdc, clt: cumClt });
  }

  // ── Activity (last 200, sorted desc) ──────────────────────────────────────
  const activityRaw: ActivityItem[] = [];

  for (const b of updownBets) {
    const market = b.updown_markets;
    const sym    = market?.symbol ?? "UNKNOWN";
    const dur    = market?.duration_min ? `${market.duration_min}m` : "";
    const amt    = Number(b.amount ?? 0);
    const pay    = Number(b.payout ?? 0);
    const s      = b.status ?? "";
    const pnl    = ["won", "claimed", "paid"].includes(s) ? pay - amt : s === "lost" ? -amt : 0;
    activityRaw.push({
      id:              b.id,
      market_type:     "updown",
      label:           `${sym.replace("USDT", "")} · ${dur}`,
      direction_badge: b.direction?.toUpperCase() ?? null,
      token:           "usdc",
      amount:          amt,
      pnl,
      status:          s,
      created_at:      b.created_at,
    });
  }

  for (const b of mutuelBets) {
    const market = b.mutuel_markets;
    const title  = market?.title ?? "Pool market";
    const amt    = Number(b.amount ?? 0);
    const pay    = Number(b.payout_amount ?? 0);
    const s      = b.status ?? "";
    const marketResolved = market?.status === "resolved";
    const isWinner = pay > 0;
    const isLoser  = marketResolved && !isWinner && market?.winning_option_id
                     && b.option_id !== market.winning_option_id;
    const pnl = isWinner ? pay - amt : isLoser ? -amt : 0;
    activityRaw.push({
      id:              b.id,
      market_type:     "pool",
      label:           title.length > 40 ? title.slice(0, 40) + "…" : title,
      direction_badge: null,
      token:           b.token === "usdc" ? "usdc" : "clt",
      amount:          amt,
      pnl,
      status:          isWinner ? "won" : isLoser ? "lost" : s,
      created_at:      b.created_at,
    });
  }

  for (const b of predBets) {
    const title  = b.market_title ?? "Prediction";
    const amt    = Number(b.amount ?? 0);
    const reward = Number(b.net_reward ?? 0);
    const s      = b.result_status ?? "";
    const pnl    = ["win", "claimed", "paid"].includes(s) ? reward
                 : s === "lose" ? -amt
                 : 0;
    activityRaw.push({
      id:              b.id,
      market_type:     "prediction",
      label:           title.length > 40 ? title.slice(0, 40) + "…" : title,
      direction_badge: null,
      token:           b.token === "clawdtrust" || b.token === "clt" ? "clt" : "usdc",
      amount:          amt,
      pnl,
      status:          s,
      created_at:      b.created_at,
    });
  }

  activityRaw.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const activity = activityRaw.slice(0, 200);

  // ── Created markets ───────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const created_markets: CreatedMarket[] = createdRaw.map((m: any) => {
    const options: { id: string; label: string }[] =
      Array.isArray(m.options)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? m.options.map((o: any) => ({ id: o.id ?? "", label: o.label ?? o.text ?? "" }))
        : [];

    const volume = m.bet_token === "usdc"
      ? Number(m.total_pool_usdc ?? 0)
      : Number(m.total_pool_clt ?? 0);

    const fee_earned = Math.round(volume * 0.01 * 1_000_000) / 1_000_000;

    let winning_option_label: string | null = null;
    if (m.winning_option_id) {
      const wo = options.find((o) => o.id === m.winning_option_id);
      winning_option_label = wo?.label ?? null;
    }

    return {
      id:                   m.id,
      title:                m.title ?? "",
      status:               m.status ?? "pending",
      cover_image_src:      m.cover_image_src ?? null,
      bet_token:            m.bet_token ?? "usdc",
      volume,
      bet_count:            Number(m.bet_count ?? 0),
      winning_option_label,
      fee_earned,
      created_at:           m.created_at,
      options,
    };
  });

  return {
    wallet,
    stats: {
      rank,
      total_rounds,
      win_count:    winCount,
      win_rate,
      octo_balance: octoBalance,
    },
    volume: {
      usdc: volumeUsdc,
      clt:  volumeClt,
    },
    pnl_series,
    activity,
    created_markets,
  };
}

// ─── Cached export (60 s TTL, per wallet) ────────────────────────────────────

export const getPublicProfile = unstable_cache(
  _getPublicProfile,
  ["public-profile"],
  { revalidate: 60, tags: ["profile"] }
);

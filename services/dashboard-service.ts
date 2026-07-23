import { createClient, createAdminClient } from "@/lib/supabase/server";
import type {
  PredictionHistoryRow,
  PredictionResultStatus,
  WalletRow,
  TaskWithCompletion,
} from "@/lib/supabase/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BetHistoryRow = PredictionHistoryRow & { result_status: PredictionResultStatus };

export type TokenActivity = {
  id: string;
  type: "win" | "commission" | "withdrawal" | "prediction";
  label: string;
  sub: string;
  amount: number;
  direction: "in" | "out";
  created_at: string;
};

export type OctoActivity = {
  id: string;
  type: "referral" | "bet" | "task";
  label: string;
  sub: string;
  amount: number;
  created_at: string;
};

export type TokenStats = {
  volume: number;
  gains: number;
  losses: number;
};

export type OctoStats = {
  referral: number;
  bet: number;
  task: number;
};

export type ReferralRow = {
  id: string;
  referred_wallet: string;
  created_at: string;
  usdc_commission: number;
  clt_commission: number;
};

export type DashboardData = {
  wallet: WalletRow | null;
  bets: BetHistoryRow[];
  // Balances
  usdcBalance: number;
  cltBalance: number;
  octoBalance: number;
  // Per-token activity & stats
  usdcActivity: TokenActivity[];
  cltActivity: TokenActivity[];
  octoActivity: OctoActivity[];
  usdcStats: TokenStats;
  cltStats: TokenStats;
  octoStats: OctoStats;
  // Referral
  referralCode: string | null;
  referralCount: number;
  referrals: ReferralRow[];
  // Tasks
  tasks: TaskWithCompletion[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isClt  = (token: string) => token === "clawdtrust" || token === "clt";
const isUsdc = (token: string) => token === "usdc";
const isWin  = (s: string) => ["win", "claimed", "paid"].includes(s);
const isLoss = (s: string) => s === "lose";

function fmtAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ─── Main query ───────────────────────────────────────────────────────────────

export async function getDashboardData(walletAddress: string): Promise<DashboardData> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  // Admin client bypasses RLS — used for withdrawal_requests which may not have
  // user-facing RLS policies set up.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminDb = createAdminClient() as any;

  const [
    walletRes,
    betsRes,
    commissionsRes,
    octoRes,
    refCodeRes,
    referralsRes,
    tasksRes,
    completionsRes,
    updownBetsRes,
    mutuelBetsRes,
    withdrawalsRes,
    pendingPaymentsRes,
  ] = await Promise.all([
    supabase.from("wallets").select("*").eq("address", walletAddress).maybeSingle(),

    supabase
      .from("prediction_history_with_status")
      .select("*")
      .eq("wallet_address", walletAddress)
      .order("created_at", { ascending: false })
      .limit(100),

    // adminDb bypasses RLS — safer than relying on JWT user_metadata for wallet match
    adminDb
      .from("referral_commissions")
      .select("id, amount_usdc, amount_clt, referred_wallet, created_at")
      .eq("referrer_wallet", walletAddress)
      .order("created_at", { ascending: false })
      .limit(50),

    // adminDb bypasses RLS — octo_transactions is written by service key, no user-facing RLS policy
    adminDb
      .from("octo_transactions")
      .select("id, type, amount, bet_amount_usd, created_at")
      .eq("wallet_address", walletAddress)
      .order("created_at", { ascending: false })
      .limit(100),

    // leaderboard_octo removed — octoBalance now computed from octo_transactions (task #42)

    db
      .from("referral_codes")
      .select("code")
      .eq("wallet_address", walletAddress)
      .maybeSingle(),

    db
      .from("referrals")
      .select("id, referred_wallet, created_at")
      .eq("referrer_wallet", walletAddress)
      .order("created_at", { ascending: false }),

    supabase
      .from("tasks")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),

    db
      .from("user_task_completions")
      .select("task_id, completed_at")
      .eq("wallet_address", walletAddress),

    // ALL Up/Down bets — needed for volume, wins, and losses across all statuses
    db
      .from("updown_bets")
      .select("id, direction, amount, payout, token, status, created_at, updown_markets(symbol)")
      .eq("wallet_address", walletAddress)
      .order("created_at", { ascending: false })
      .limit(200),

    // ALL mutuel pool bets — needed for volume, wins, losses, and balance
    db
      .from("mutuel_bets")
      .select("id, amount, token, option_id, payout_amount, status, paid_at, created_at, mutuel_markets(title, winning_option_id, status, is_refund)")
      .eq("wallet_address", walletAddress)
      .order("created_at", { ascending: false })
      .limit(200),

    // All withdrawal requests — used for balance deduction AND activity feed
    adminDb
      .from("withdrawal_requests")
      .select("id, token, amount, status, created_at")
      .eq("wallet_address", walletAddress)
      .order("created_at", { ascending: false }),

    // Pending/recent prediction + pool payments — shown in activity before admin approval
    adminDb
      .from("payments")
      .select("id, title, subtitle, amount_usdc, token, status, flow, created_at")
      .eq("user_wallet", walletAddress)
      .in("flow", ["prediction", "pool_prediction"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bets: BetHistoryRow[]   = (betsRes.data ?? []) as BetHistoryRow[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commissions: any[]      = commissionsRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const octoTxns: any[]         = octoRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const referrals: any[]        = referralsRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawTasks: any[]         = tasksRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completions: any[]      = completionsRes.data ?? [];
  // All updown/mutuel bets (not filtered) — used for stats, balance, and activity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updownWins: any[]       = updownBetsRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutuelWins: any[]       = mutuelBetsRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingPayments: any[]  = pendingPaymentsRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paidWithdrawals: any[]  = withdrawalsRes.data ?? [];

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const completionMap = new Map<string, string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    completions.map((c: any) => [c.task_id as string, c.completed_at as string])
  );
  const tasks: TaskWithCompletion[] = rawTasks.map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (t: any) => ({
      ...t,
      completed: completionMap.has(t.id),
      completed_at: completionMap.get(t.id) ?? null,
    })
  );

  // ── Per-market-type breakdowns ────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isUpdownWin = (b: any) => ["won", "claimed", "paid"].includes(b.status as string);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isMutuelWin = (b: any) => (b.payout_amount ?? 0) > 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isMutuelLoss = (b: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mkt = b.mutuel_markets as any;
    return mkt?.status === "resolved" && !mkt?.is_refund && b.option_id !== mkt?.winning_option_id;
  };

  // USDC sub-totals
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updownUsdc      = updownWins.filter((b: any) => isUsdc(b.token ?? "usdc"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutuelUsdc      = mutuelWins.filter((b: any) => isUsdc(b.token ?? "usdc"));
  const updownUsdcGains = updownUsdc.filter(isUpdownWin).reduce((s: number, b: any) => s + (b.payout ?? 0), 0);
  const mutuelUsdcGains = mutuelUsdc.filter(isMutuelWin).reduce((s: number, b: any) => s + (b.payout_amount ?? 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commUsdc        = commissions.reduce((s: number, r: any) => s + (r.amount_usdc ?? 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usdcWithdrawn   = paidWithdrawals
    .filter((w: any) => w.token === "usdc" && w.status !== "rejected")
    .reduce((s: number, w: any) => s + (w.amount ?? 0), 0);

  // CLT sub-totals
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updownClt      = updownWins.filter((b: any) => isClt(b.token ?? ""));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutuelClt      = mutuelWins.filter((b: any) => isClt(b.token ?? ""));
  const updownCltGains = updownClt.filter(isUpdownWin).reduce((s: number, b: any) => s + (b.payout ?? 0), 0);
  const mutuelCltGains = mutuelClt.filter(isMutuelWin).reduce((s: number, b: any) => s + (b.payout_amount ?? 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commClt        = commissions.reduce((s: number, r: any) => s + (r.amount_clt ?? 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cltWithdrawn   = paidWithdrawals
    .filter((w: any) => w.token === "clawdtrust" && w.status !== "rejected")
    .reduce((s: number, w: any) => s + (w.amount ?? 0), 0);

  // ── USDC stats (prediction + updown + mutuel) ─────────────────────────────
  const usdcBets = bets.filter((b) => isUsdc(b.token));
  const usdcStats: TokenStats = {
    volume:
      usdcBets.reduce((s, b) => s + (b.amount ?? 0), 0) +
      updownUsdc.reduce((s: number, b: any) => s + (b.amount ?? 0), 0) +
      mutuelUsdc.reduce((s: number, b: any) => s + (b.amount ?? 0), 0),
    gains:
      usdcBets.filter((b) => isWin(b.result_status)).reduce((s, b) => s + (b.net_reward ?? 0), 0) +
      updownUsdcGains +
      mutuelUsdcGains,
    losses:
      usdcBets.filter((b) => isLoss(b.result_status)).reduce((s, b) => s + (b.amount ?? 0), 0) +
      updownUsdc.filter((b: any) => b.status === "lost").reduce((s: number, b: any) => s + (b.amount ?? 0), 0) +
      mutuelUsdc.filter(isMutuelLoss).reduce((s: number, b: any) => s + (b.amount ?? 0), 0),
  };
  const usdcBalance = Math.max(0, usdcStats.gains + commUsdc - usdcWithdrawn);

  // ── CLT stats (prediction + updown + mutuel) ──────────────────────────────
  const cltBets = bets.filter((b) => isClt(b.token));
  const cltStats: TokenStats = {
    volume:
      cltBets.reduce((s, b) => s + (b.amount ?? 0), 0) +
      updownClt.reduce((s: number, b: any) => s + (b.amount ?? 0), 0) +
      mutuelClt.reduce((s: number, b: any) => s + (b.amount ?? 0), 0),
    gains:
      cltBets.filter((b) => isWin(b.result_status)).reduce((s, b) => s + (b.net_reward ?? 0), 0) +
      updownCltGains +
      mutuelCltGains,
    losses:
      cltBets.filter((b) => isLoss(b.result_status)).reduce((s, b) => s + (b.amount ?? 0), 0) +
      updownClt.filter((b: any) => b.status === "lost").reduce((s: number, b: any) => s + (b.amount ?? 0), 0) +
      mutuelClt.filter(isMutuelLoss).reduce((s: number, b: any) => s + (b.amount ?? 0), 0),
  };
  const cltBalance = Math.max(0, cltStats.gains + commClt - cltWithdrawn);

  // ── OCTO stats & balance ──────────────────────────────────────────────────
  const octoStats: OctoStats = {
    referral: octoTxns.filter((t) => t.type === "referral").reduce((s: number, t: any) => s + (t.amount ?? 0), 0),
    bet:      octoTxns.filter((t) => t.type === "bet").reduce((s: number, t: any) => s + (t.amount ?? 0), 0),
    task:     octoTxns.filter((t) => t.type === "task").reduce((s: number, t: any) => s + (t.amount ?? 0), 0),
  };
  // task #42: compute octoBalance directly from octo_transactions (source of truth).
  // This eliminates the leaderboard_octo sync issue where a failed upsert would cause
  // the displayed balance to lag behind actual earned OCTO.
  const octoBalance = octoTxns.reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);

  // ── USDC activity (prediction wins + updown wins + mutuel wins + commissions) ─
  const usdcActivity: TokenActivity[] = [
    ...usdcBets
      .filter((b) => isWin(b.result_status))
      .map((b) => ({
        id: b.id,
        type: "win" as const,
        label: b.market_title ?? "Prediction win",
        sub: `Won · x${b.payout_multiple ?? "?"}`,
        amount: b.net_reward ?? 0,
        direction: "in" as const,
        created_at: b.created_at,
      })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...updownWins
      .filter((b: any) => isUsdc(b.token ?? "usdc") && isUpdownWin(b))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => ({
        id: b.id as string,
        type: "win" as const,
        label: `${(b.updown_markets as any)?.symbol ?? "Crypto"} Up/Down`,
        sub: "Won",
        amount: (b.payout as number) ?? 0,
        direction: "in" as const,
        created_at: b.created_at as string,
      })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...mutuelWins
      .filter((b: any) => isUsdc(b.token ?? "usdc") && isMutuelWin(b))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => ({
        id: b.id as string,
        type: "win" as const,
        label: (b.mutuel_markets as any)?.title ?? "Pool win",
        sub: "Pool payout",
        amount: (b.payout_amount as number) ?? 0,
        direction: "in" as const,
        created_at: b.created_at as string,
      })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...commissions
      .filter((r: any) => (r.amount_usdc ?? 0) > 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any, i: number) => ({
        id: r.id ?? `comm-usdc-${i}`,
        type: "commission" as const,
        label: "Referral commission",
        sub: r.referred_wallet ? fmtAddr(r.referred_wallet as string) : "",
        amount: r.amount_usdc as number,
        direction: "in" as const,
        created_at: r.created_at as string,
      })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...paidWithdrawals
      .filter((w: any) => w.token === "usdc")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((w: any) => {
        const statusLabel: Record<string, string> = {
          pending:  "Withdrawal pending",
          approved: "Withdrawal approved",
          paid:     "Withdrawal paid",
          rejected: "Withdrawal rejected",
        };
        return {
          id: w.id as string,
          type: "withdrawal" as const,
          label: statusLabel[w.status as string] ?? "Withdrawal",
          sub: w.status === "paid" ? "Sent to your wallet" :
               w.status === "rejected" ? "Declined" :
               w.status === "approved" ? "Payment in progress" : "Awaiting admin review",
          amount: w.amount as number,
          direction: "out" as const,
          created_at: w.created_at as string,
        };
      }),
    // Pending prediction + pool payments (visible before admin approval)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...pendingPayments
      .filter((p: any) => isUsdc(p.token ?? "usdc"))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => {
        const isPool = p.flow === "pool_prediction";
        return {
          id: p.id as string,
          type: "prediction" as const,
          label: (p.title as string) ?? (isPool ? "Pool bet placed" : "Prediction placed"),
          sub: p.status === "rejected" ? "Rejected" :
               p.status === "approved" ? (isPool ? "Pool bet confirmed" : "Prediction confirmed · Awaiting result") :
               (isPool ? "Pool bet placed · Pending review" : "Prediction placed · Pending review"),
          amount: (p.amount_usdc as number) ?? 0,
          direction: "in" as const,
          created_at: p.created_at as string,
        };
      }),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // ── CLT activity (prediction wins + updown wins + mutuel wins + commissions) ──
  const cltActivity: TokenActivity[] = [
    ...cltBets
      .filter((b) => isWin(b.result_status))
      .map((b) => ({
        id: b.id,
        type: "win" as const,
        label: b.market_title ?? "Prediction win",
        sub: `Won · x${b.payout_multiple ?? "?"}`,
        amount: b.net_reward ?? 0,
        direction: "in" as const,
        created_at: b.created_at,
      })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...updownWins
      .filter((b: any) => isClt(b.token ?? "") && isUpdownWin(b))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => ({
        id: b.id as string,
        type: "win" as const,
        label: `${(b.updown_markets as any)?.symbol ?? "Crypto"} Up/Down`,
        sub: "Won",
        amount: (b.payout as number) ?? 0,
        direction: "in" as const,
        created_at: b.created_at as string,
      })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...mutuelWins
      .filter((b: any) => isClt(b.token ?? "") && isMutuelWin(b))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => ({
        id: b.id as string,
        type: "win" as const,
        label: (b.mutuel_markets as any)?.title ?? "Pool win",
        sub: "Pool payout",
        amount: (b.payout_amount as number) ?? 0,
        direction: "in" as const,
        created_at: b.created_at as string,
      })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...commissions
      .filter((r: any) => (r.amount_clt ?? 0) > 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any, i: number) => ({
        id: r.id ?? `comm-clt-${i}`,
        type: "commission" as const,
        label: "Referral commission",
        sub: r.referred_wallet ? fmtAddr(r.referred_wallet as string) : "",
        amount: r.amount_clt as number,
        direction: "in" as const,
        created_at: r.created_at as string,
      })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...paidWithdrawals
      .filter((w: any) => w.token === "clawdtrust")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((w: any) => {
        const statusLabel: Record<string, string> = {
          pending:  "Withdrawal pending",
          approved: "Withdrawal approved",
          paid:     "Withdrawal paid",
          rejected: "Withdrawal rejected",
        };
        return {
          id: w.id as string,
          type: "withdrawal" as const,
          label: statusLabel[w.status as string] ?? "Withdrawal",
          sub: w.status === "paid" ? "Sent to your wallet" :
               w.status === "rejected" ? "Declined" :
               w.status === "approved" ? "Payment in progress" : "Awaiting admin review",
          amount: w.amount as number,
          direction: "out" as const,
          created_at: w.created_at as string,
        };
      }),
    // Pending CLT prediction + pool payments (visible before admin approval)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...pendingPayments
      .filter((p: any) => isClt(p.token ?? ""))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => {
        const isPool = p.flow === "pool_prediction";
        return {
          id: p.id as string,
          type: "prediction" as const,
          label: (p.title as string) ?? (isPool ? "Pool bet placed" : "Prediction placed"),
          sub: p.status === "rejected" ? "Rejected" :
               p.status === "approved" ? (isPool ? "Pool bet confirmed" : "Prediction confirmed · Awaiting result") :
               (isPool ? "Pool bet placed · Pending review" : "Prediction placed · Pending review"),
          amount: (p.amount_usdc as number) ?? 0,
          direction: "in" as const,
          created_at: p.created_at as string,
        };
      }),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // ── OCTO activity ─────────────────────────────────────────────────────────
  const OCTO_TYPE_LABELS: Record<string, string> = {
    referral: "Referral bonus",
    bet:      "Bet reward",
    task:     "Task reward",
  };
  const octoActivity: OctoActivity[] = octoTxns.map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (t: any) => ({
      id: t.id as string,
      type: (t.type as "referral" | "bet" | "task") ?? "bet",
      label: OCTO_TYPE_LABELS[t.type as string] ?? "Reward",
      sub: t.bet_amount_usd != null ? `$${Number(t.bet_amount_usd).toFixed(2)}` : "",
      amount: (t.amount as number) ?? 0,
      created_at: t.created_at as string,
    })
  );

  // ── Referrals with per-referred commissions ───────────────────────────────
  const commByReferred = new Map<string, { usdc: number; clt: number }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of commissions as any[]) {
    const key = (c.referred_wallet as unknown as string) ?? "";
    const cur = commByReferred.get(key) ?? { usdc: 0, clt: 0 };
    cur.usdc += (c.amount_usdc as number) ?? 0;
    cur.clt  += (c.amount_clt  as number) ?? 0;
    commByReferred.set(key, cur);
  }
  const referralRows: ReferralRow[] = referrals.map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any) => ({
      id:               r.id as string,
      referred_wallet:  r.referred_wallet as string,
      created_at:       r.created_at as string,
      usdc_commission:  commByReferred.get(r.referred_wallet as string)?.usdc ?? 0,
      clt_commission:   commByReferred.get(r.referred_wallet as string)?.clt  ?? 0,
    })
  );

  return {
    wallet:        walletRes.data ?? null,
    bets,
    usdcBalance,
    cltBalance,
    octoBalance,
    usdcActivity,
    cltActivity,
    octoActivity,
    usdcStats,
    cltStats,
    octoStats,
    referralCode:  refCodeRes.data?.code ?? null,
    referralCount: referralRows.length,
    referrals:     referralRows,
    tasks,
  };
}

// ─── Up/Down Bets ─────────────────────────────────────────────────────────────

export interface UpdownBetHistory {
  id: string;
  market_id: string;
  wallet_address: string;
  direction: "up" | "down";
  amount: number;
  status: "pending" | "approved" | "rejected" | "won" | "lost" | "refunded" | "claimed" | "paid";
  payout: number | null;
  created_at: string;
  updown_markets: {
    symbol: string;
    duration_min: number;
    strike_price: number;
    status: string;
    outcome: string | null;
  } | null;
}

export async function getUpdownBets(walletAddress: string): Promise<UpdownBetHistory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("updown_bets")
    .select(`
      id,
      market_id,
      wallet_address,
      direction,
      amount,
      status,
      payout,
      created_at,
      updown_markets (
        symbol,
        duration_min,
        strike_price,
        status,
        outcome
      )
    `)
    .eq("wallet_address", walletAddress)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getUpdownBets]", error.message);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any;
}

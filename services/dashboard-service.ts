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
  type: "win" | "commission" | "withdrawal";
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
    leaderboardOctoRes,
    refCodeRes,
    referralsRes,
    tasksRes,
    completionsRes,
    updownBetsRes,
    mutuelBetsRes,
    withdrawalsRes,
  ] = await Promise.all([
    supabase.from("wallets").select("*").eq("address", walletAddress).maybeSingle(),

    supabase
      .from("prediction_history_with_status")
      .select("*")
      .eq("wallet_address", walletAddress)
      .order("created_at", { ascending: false })
      .limit(100),

    db
      .from("referral_commissions")
      .select("id, amount_usdc, amount_clt, referred_wallet, created_at")
      .eq("referrer_wallet", walletAddress)
      .order("created_at", { ascending: false })
      .limit(50),

    db
      .from("octo_transactions")
      .select("id, type, amount, label, created_at")
      .eq("wallet_address", walletAddress)
      .order("created_at", { ascending: false })
      .limit(100),

    // Leaderboard row — used as the canonical OCTO balance source
    db
      .from("leaderboard_octo")
      .select("total_octo")
      .eq("wallet_address", walletAddress)
      .maybeSingle(),

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

    // Up/Down bets won (payout = net gain)
    db
      .from("updown_bets")
      .select("id, direction, amount, payout, token, created_at, updown_markets(symbol)")
      .eq("wallet_address", walletAddress)
      .in("status", ["won", "claimed", "paid"])
      .order("created_at", { ascending: false })
      .limit(100),

    // Mutuel pool bets with a payout (won or refunded)
    db
      .from("mutuel_bets")
      .select("id, amount, token, payout_amount, paid_at, created_at, mutuel_markets(title)")
      .eq("wallet_address", walletAddress)
      .not("payout_amount", "is", null)
      .order("created_at", { ascending: false })
      .limit(100),

    // All withdrawal requests — used for balance deduction AND activity feed
    adminDb
      .from("withdrawal_requests")
      .select("id, token, amount, status, created_at")
      .eq("wallet_address", walletAddress)
      .order("created_at", { ascending: false }),
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updownWins: any[]       = updownBetsRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutuelWins: any[]       = mutuelBetsRes.data ?? [];
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

  // ── USDC stats & balance ──────────────────────────────────────────────────
  const usdcBets = bets.filter((b) => isUsdc(b.token));
  const usdcStats: TokenStats = {
    volume: usdcBets.reduce((s, b) => s + (b.amount ?? 0), 0),
    gains:  usdcBets.filter((b) => isWin(b.result_status)).reduce((s, b) => s + (b.net_reward ?? 0), 0),
    losses: usdcBets.filter((b) => isLoss(b.result_status)).reduce((s, b) => s + (b.amount ?? 0), 0),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commUsdc = commissions.reduce((s: number, r: any) => s + (r.amount_usdc ?? 0), 0);
  // Up/Down wins in USDC (payout = net gain already net of fees)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updownUsdcGains = updownWins
    .filter((b: any) => isUsdc(b.token ?? "usdc"))
    .reduce((s: number, b: any) => s + (b.payout ?? 0), 0);
  // Mutuel pool wins in USDC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutuelUsdcGains = mutuelWins
    .filter((b: any) => isUsdc(b.token ?? "usdc"))
    .reduce((s: number, b: any) => s + (b.payout_amount ?? 0), 0);
  // Deduct all non-rejected withdrawals in USDC (pending + approved + paid)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usdcWithdrawn = paidWithdrawals
    .filter((w: any) => w.token === "usdc" && w.status !== "rejected")
    .reduce((s: number, w: any) => s + (w.amount ?? 0), 0);
  const usdcBalance = Math.max(0, usdcStats.gains + commUsdc + updownUsdcGains + mutuelUsdcGains - usdcWithdrawn);

  // ── CLT stats & balance ───────────────────────────────────────────────────
  const cltBets = bets.filter((b) => isClt(b.token));
  const cltStats: TokenStats = {
    volume: cltBets.reduce((s, b) => s + (b.amount ?? 0), 0),
    gains:  cltBets.filter((b) => isWin(b.result_status)).reduce((s, b) => s + (b.net_reward ?? 0), 0),
    losses: cltBets.filter((b) => isLoss(b.result_status)).reduce((s, b) => s + (b.amount ?? 0), 0),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commClt = commissions.reduce((s: number, r: any) => s + (r.amount_clt ?? 0), 0);
  // Up/Down wins in CLT
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updownCltGains = updownWins
    .filter((b: any) => isClt(b.token ?? ""))
    .reduce((s: number, b: any) => s + (b.payout ?? 0), 0);
  // Mutuel pool wins in CLT
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutuelCltGains = mutuelWins
    .filter((b: any) => isClt(b.token ?? ""))
    .reduce((s: number, b: any) => s + (b.payout_amount ?? 0), 0);
  // Deduct all non-rejected withdrawals in CLT (pending + approved + paid)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cltWithdrawn = paidWithdrawals
    .filter((w: any) => w.token === "clawdtrust" && w.status !== "rejected")
    .reduce((s: number, w: any) => s + (w.amount ?? 0), 0);
  const cltBalance = Math.max(0, cltStats.gains + commClt + updownCltGains + mutuelCltGains - cltWithdrawn);

  // ── OCTO stats & balance ──────────────────────────────────────────────────
  const octoStats: OctoStats = {
    referral: octoTxns.filter((t) => t.type === "referral").reduce((s: number, t: any) => s + (t.amount ?? 0), 0),
    bet:      octoTxns.filter((t) => t.type === "bet").reduce((s: number, t: any) => s + (t.amount ?? 0), 0),
    task:     octoTxns.filter((t) => t.type === "task").reduce((s: number, t: any) => s + (t.amount ?? 0), 0),
  };
  // Use leaderboard_octo as canonical balance (includes all sources).
  // Fall back to octo_transactions sum if the user has no leaderboard row yet.
  const leaderboardOcto = Number((leaderboardOctoRes as any).data?.total_octo ?? 0);
  const txnOcto = octoTxns.reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);
  const octoBalance = leaderboardOcto > 0 ? leaderboardOcto : txnOcto;

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
      .filter((b: any) => isUsdc(b.token ?? "usdc"))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => ({
        id: b.id as string,
        type: "win" as const,
        label: `${(b.updown_markets as any)?.symbol ?? "Crypto"} Up/Down`,
        sub: "Won",
        amount: b.payout as number ?? 0,
        direction: "in" as const,
        created_at: b.created_at as string,
      })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...mutuelWins
      .filter((b: any) => isUsdc(b.token ?? "usdc"))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => ({
        id: b.id as string,
        type: "win" as const,
        label: (b.mutuel_markets as any)?.title ?? "Pool win",
        sub: "Pool payout",
        amount: b.payout_amount as number ?? 0,
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
      .filter((b: any) => isClt(b.token ?? ""))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => ({
        id: b.id as string,
        type: "win" as const,
        label: `${(b.updown_markets as any)?.symbol ?? "Crypto"} Up/Down`,
        sub: "Won",
        amount: b.payout as number ?? 0,
        direction: "in" as const,
        created_at: b.created_at as string,
      })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...mutuelWins
      .filter((b: any) => isClt(b.token ?? ""))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => ({
        id: b.id as string,
        type: "win" as const,
        label: (b.mutuel_markets as any)?.title ?? "Pool win",
        sub: "Pool payout",
        amount: b.payout_amount as number ?? 0,
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
      // Show the stored label (market title, referral wallet, task name) as sub-text
      sub: (t.label as string | null) ?? "",
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

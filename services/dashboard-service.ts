import { createClient } from "@/lib/supabase/server";
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
  type: "win" | "commission";
  label: string;
  sub: string;
  amount: number;
  direction: "in";
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

  const [
    walletRes,
    betsRes,
    commissionsRes,
    octoRes,
    refCodeRes,
    referralsRes,
    tasksRes,
    completionsRes,
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
      .order("created_at", { ascending: false }),

    db
      .from("octo_transactions")
      .select("id, type, amount, created_at")
      .eq("wallet_address", walletAddress)
      .order("created_at", { ascending: false }),

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
  const usdcBalance = usdcStats.gains + commUsdc;

  // ── CLT stats & balance ───────────────────────────────────────────────────
  const cltBets = bets.filter((b) => isClt(b.token));
  const cltStats: TokenStats = {
    volume: cltBets.reduce((s, b) => s + (b.amount ?? 0), 0),
    gains:  cltBets.filter((b) => isWin(b.result_status)).reduce((s, b) => s + (b.net_reward ?? 0), 0),
    losses: cltBets.filter((b) => isLoss(b.result_status)).reduce((s, b) => s + (b.amount ?? 0), 0),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commClt = commissions.reduce((s: number, r: any) => s + (r.amount_clt ?? 0), 0);
  const cltBalance = cltStats.gains + commClt;

  // ── OCTO stats & balance ──────────────────────────────────────────────────
  const octoStats: OctoStats = {
    referral: octoTxns.filter((t) => t.type === "referral").reduce((s: number, t: any) => s + (t.amount ?? 0), 0),
    bet:      octoTxns.filter((t) => t.type === "bet").reduce((s: number, t: any) => s + (t.amount ?? 0), 0),
    task:     octoTxns.filter((t) => t.type === "task").reduce((s: number, t: any) => s + (t.amount ?? 0), 0),
  };
  const octoBalance = octoTxns.reduce((s: number, t: any) => s + (t.amount ?? 0), 0);

  // ── USDC activity (wins + commissions merged, sorted desc) ────────────────
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
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // ── CLT activity (wins + commissions merged, sorted desc) ─────────────────
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
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // ── OCTO activity ─────────────────────────────────────────────────────────
  const OCTO_LABELS: Record<string, string> = {
    referral: "Referral bonus",
    bet:      "Bet reward",
    task:     "Task reward",
  };
  const octoActivity: OctoActivity[] = octoTxns.map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (t: any) => ({
      id: t.id as string,
      type: (t.type as "referral" | "bet" | "task") ?? "bet",
      label: OCTO_LABELS[t.type as string] ?? "Reward",
      sub: "",
      amount: t.amount as number ?? 0,
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

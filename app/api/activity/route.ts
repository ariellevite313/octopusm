import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/activity
 * Returns usdcActivity and cltActivity for the authenticated user.
 * Used by token-balances.tsx to refresh the Recent Activity panel in real-time
 * when bets resolve (Realtime UPDATE events on updown_bets / mutuel_bets).
 */

const isClt  = (t: string) => t === "clawdtrust" || t === "clt";
const isUsdc = (t: string) => t === "usdc";
const isWin  = (s: string) => ["win", "claimed", "paid"].includes(s);

function fmtAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const WITHDRAWAL_LABEL: Record<string, string> = {
  pending:  "Withdrawal pending",
  approved: "Withdrawal approved",
  paid:     "Withdrawal paid",
  rejected: "Withdrawal rejected",
};
const WITHDRAWAL_SUB: Record<string, string> = {
  pending:  "Awaiting admin review",
  approved: "Payment in progress",
  paid:     "Sent to your wallet",
  rejected: "Declined",
};

export async function GET() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient() as any;

  const [betsRes, commissionsRes, updownBetsRes, mutuelBetsRes, withdrawalsRes, pendingPaymentsRes, octoRes] = await Promise.all([
    // Prediction results (wins + losses)
    admin
      .from("prediction_history_with_status")
      .select("id, token, amount_usdc, net_reward, result_status, market_title, payout_multiple, created_at")
      .eq("wallet_address", wallet)
      .order("created_at", { ascending: false })
      .limit(100),

    // Referral commissions
    admin
      .from("referral_commissions")
      .select("id, amount_usdc, amount_clt, referred_wallet, created_at")
      .eq("referrer_wallet", wallet)
      .order("created_at", { ascending: false })
      .limit(50),

    // Up/Down bets (wins + losses)
    admin
      .from("updown_bets")
      .select("id, direction, amount, payout, token, status, created_at, updown_markets(symbol)")
      .eq("wallet_address", wallet)
      .in("status", ["won", "claimed", "paid", "lost", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(100),

    // Pool bets (wins + losses: join market status to distinguish loss from pending)
    admin
      .from("mutuel_bets")
      .select("id, amount, token, payout_amount, paid_at, created_at, mutuel_markets(title, status)")
      .eq("wallet_address", wallet)
      .order("created_at", { ascending: false })
      .limit(100),

    // All withdrawals for the outgoing activity feed
    admin
      .from("withdrawal_requests")
      .select("id, token, amount, status, created_at")
      .eq("wallet_address", wallet)
      .order("created_at", { ascending: false }),

    // Pending prediction + pool payments — visible before admin approves
    admin
      .from("payments")
      .select("id, title, amount_usdc, token, status, flow, created_at")
      .eq("user_wallet", wallet)
      .in("flow", ["prediction", "pool_prediction"])
      .order("created_at", { ascending: false })
      .limit(50),

    // OCTO transactions
    admin
      .from("octo_transactions")
      .select("id, type, amount, label, created_at")
      .eq("wallet_address", wallet)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bets: any[]            = betsRes.data            ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commissions: any[]     = commissionsRes.data      ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updownBets: any[]      = updownBetsRes.data       ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutuelBets: any[]      = mutuelBetsRes.data       ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withdrawals: any[]     = withdrawalsRes.data      ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingPayments: any[] = pendingPaymentsRes.data  ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const octoTxs: any[]         = octoRes.data             ?? [];

  const updownWins   = updownBets.filter((b: any) => ["won","claimed","paid"].includes(b.status));
  const updownLosses = updownBets.filter((b: any) => b.status === "lost" || b.status === "cancelled");
  const mutuelWins   = mutuelBets.filter((b: any) => (b.payout_amount ?? 0) > 0);
  const mutuelLosses = mutuelBets.filter((b: any) =>
    (b.payout_amount == null || b.payout_amount === 0) &&
    (b.mutuel_markets as any)?.status === "resolved"
  );

  const usdcBets = bets.filter((b) => isUsdc(b.token));
  const cltBets  = bets.filter((b) => isClt(b.token));

  const usdcActivity = [
    // Prediction market wins (USDC)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...usdcBets.filter((b) => isWin(b.result_status)).map((b: any) => ({
      id: b.id as string, type: "win" as const,
      label: (b.market_title as string) ?? "Prediction win",
      sub: `Won · x${(b.payout_multiple as string) ?? "?"}`,
      amount: (b.net_reward as number) ?? 0, direction: "in" as const,
      created_at: b.created_at as string,
    })),
    // Prediction market losses (USDC)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...usdcBets.filter((b) => b.result_status === "loss").map((b: any) => ({
      id: `loss-${b.id as string}`, type: "loss" as const,
      label: (b.market_title as string) ?? "Prediction",
      sub: "Lost",
      amount: (b.amount_usdc as number) ?? 0, direction: "out" as const,
      created_at: b.created_at as string,
    })),
    // Up/Down wins in USDC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...updownWins.filter((b: any) => isUsdc(b.token ?? "usdc")).map((b: any) => ({
      id: b.id as string, type: "win" as const,
      label: `${(b.updown_markets as any)?.symbol ?? "Crypto"} Up/Down`,
      sub: "Won", amount: (b.payout as number) ?? 0, direction: "in" as const,
      created_at: b.created_at as string,
    })),
    // Up/Down losses in USDC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...updownLosses.filter((b: any) => isUsdc(b.token ?? "usdc")).map((b: any) => ({
      id: `loss-${b.id as string}`, type: "loss" as const,
      label: `${(b.updown_markets as any)?.symbol ?? "Crypto"} Up/Down`,
      sub: b.status === "cancelled" ? "Cancelled" : "Lost",
      amount: (b.amount as number) ?? 0, direction: "out" as const,
      created_at: b.created_at as string,
    })),
    // Pool wins in USDC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...mutuelWins.filter((b: any) => isUsdc(b.token ?? "usdc")).map((b: any) => ({
      id: b.id as string, type: "win" as const,
      label: (b.mutuel_markets as any)?.title ?? "Pool win",
      sub: "Pool payout", amount: (b.payout_amount as number) ?? 0, direction: "in" as const,
      created_at: b.created_at as string,
    })),
    // Pool losses in USDC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...mutuelLosses.filter((b: any) => isUsdc(b.token ?? "usdc")).map((b: any) => ({
      id: `loss-${b.id as string}`, type: "loss" as const,
      label: (b.mutuel_markets as any)?.title ?? "Pool",
      sub: "Lost",
      amount: (b.amount as number) ?? 0, direction: "out" as const,
      created_at: b.created_at as string,
    })),
    // Referral commissions in USDC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...commissions.filter((r: any) => (r.amount_usdc ?? 0) > 0).map((r: any, i: number) => ({
      id: (r.id as string) ?? `comm-usdc-${i}`, type: "commission" as const,
      label: "Referral commission",
      sub: r.referred_wallet ? fmtAddr(r.referred_wallet as string) : "",
      amount: r.amount_usdc as number, direction: "in" as const,
      created_at: r.created_at as string,
    })),
    // Withdrawals in USDC (outgoing)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...withdrawals.filter((w: any) => w.token === "usdc").map((w: any) => ({
      id: w.id as string, type: "withdrawal" as const,
      label: WITHDRAWAL_LABEL[w.status as string] ?? "Withdrawal",
      sub:   WITHDRAWAL_SUB[w.status as string]   ?? "Awaiting admin review",
      amount: w.amount as number, direction: "out" as const,
      created_at: w.created_at as string,
    })),
    // Pending USDC predictions + pool bets (visible before admin approval)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...pendingPayments.filter((p: any) => isUsdc(p.token ?? "usdc")).map((p: any) => {
      const isPool = p.flow === "pool_prediction";
      return {
        id: p.id as string, type: "prediction" as const,
        label: (p.title as string) ?? (isPool ? "Pool bet placed" : "Prediction placed"),
        sub: p.status === "rejected" ? "Rejected" :
             p.status === "approved" ? (isPool ? "Pool bet confirmed" : "Prediction confirmed · Awaiting result") :
             (isPool ? "Pool bet placed · Pending review" : "Prediction placed · Pending review"),
        amount: (p.amount_usdc as number) ?? 0, direction: "in" as const,
        created_at: p.created_at as string,
      };
    }),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const cltActivity = [
    // Prediction market wins (CLT)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...cltBets.filter((b) => isWin(b.result_status)).map((b: any) => ({
      id: b.id as string, type: "win" as const,
      label: (b.market_title as string) ?? "Prediction win",
      sub: `Won · x${(b.payout_multiple as string) ?? "?"}`,
      amount: (b.net_reward as number) ?? 0, direction: "in" as const,
      created_at: b.created_at as string,
    })),
    // Prediction market losses (CLT)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...cltBets.filter((b) => b.result_status === "loss").map((b: any) => ({
      id: `loss-${b.id as string}`, type: "loss" as const,
      label: (b.market_title as string) ?? "Prediction",
      sub: "Lost",
      amount: (b.amount_usdc as number) ?? 0, direction: "out" as const,
      created_at: b.created_at as string,
    })),
    // Up/Down wins in CLT
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...updownWins.filter((b: any) => isClt(b.token ?? "")).map((b: any) => ({
      id: b.id as string, type: "win" as const,
      label: `${(b.updown_markets as any)?.symbol ?? "Crypto"} Up/Down`,
      sub: "Won", amount: (b.payout as number) ?? 0, direction: "in" as const,
      created_at: b.created_at as string,
    })),
    // Up/Down losses in CLT
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...updownLosses.filter((b: any) => isClt(b.token ?? "")).map((b: any) => ({
      id: `loss-${b.id as string}`, type: "loss" as const,
      label: `${(b.updown_markets as any)?.symbol ?? "Crypto"} Up/Down`,
      sub: b.status === "cancelled" ? "Cancelled" : "Lost",
      amount: (b.amount as number) ?? 0, direction: "out" as const,
      created_at: b.created_at as string,
    })),
    // Pool wins in CLT
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...mutuelWins.filter((b: any) => isClt(b.token ?? "")).map((b: any) => ({
      id: b.id as string, type: "win" as const,
      label: (b.mutuel_markets as any)?.title ?? "Pool win",
      sub: "Pool payout", amount: (b.payout_amount as number) ?? 0, direction: "in" as const,
      created_at: b.created_at as string,
    })),
    // Pool losses in CLT
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...mutuelLosses.filter((b: any) => isClt(b.token ?? "")).map((b: any) => ({
      id: `loss-${b.id as string}`, type: "loss" as const,
      label: (b.mutuel_markets as any)?.title ?? "Pool",
      sub: "Lost",
      amount: (b.amount as number) ?? 0, direction: "out" as const,
      created_at: b.created_at as string,
    })),
    // Referral commissions in CLT
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...commissions.filter((r: any) => (r.amount_clt ?? 0) > 0).map((r: any, i: number) => ({
      id: (r.id as string) ?? `comm-clt-${i}`, type: "commission" as const,
      label: "Referral commission",
      sub: r.referred_wallet ? fmtAddr(r.referred_wallet as string) : "",
      amount: r.amount_clt as number, direction: "in" as const,
      created_at: r.created_at as string,
    })),
    // Withdrawals in CLT (outgoing)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...withdrawals.filter((w: any) => w.token === "clawdtrust").map((w: any) => ({
      id: w.id as string, type: "withdrawal" as const,
      label: WITHDRAWAL_LABEL[w.status as string] ?? "Withdrawal",
      sub:   WITHDRAWAL_SUB[w.status as string]   ?? "Awaiting admin review",
      amount: w.amount as number, direction: "out" as const,
      created_at: w.created_at as string,
    })),
    // Pending CLT predictions + pool bets (visible before admin approval)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...pendingPayments.filter((p: any) => isClt(p.token ?? "")).map((p: any) => {
      const isPool = p.flow === "pool_prediction";
      return {
        id: p.id as string, type: "prediction" as const,
        label: (p.title as string) ?? (isPool ? "Pool bet placed" : "Prediction placed"),
        sub: p.status === "rejected" ? "Rejected" :
             p.status === "approved" ? (isPool ? "Pool bet confirmed" : "Prediction confirmed · Awaiting result") :
             (isPool ? "Pool bet placed · Pending review" : "Prediction placed · Pending review"),
        amount: (p.amount_usdc as number) ?? 0, direction: "in" as const,
        created_at: p.created_at as string,
      };
    }),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const octoActivity = octoTxs.map((t: any) => ({
    id: t.id as string,
    type: t.type as "bet" | "task" | "referral",
    amount: Number(t.amount ?? 0),
    label: (t.label as string) ?? "OCTO earned",
    sub: t.type === "bet" ? "Bet placed" : t.type === "task" ? "Task completed" : "Referral",
    created_at: t.created_at as string,
  }));

  return NextResponse.json({ usdcActivity, cltActivity, octoActivity });
}

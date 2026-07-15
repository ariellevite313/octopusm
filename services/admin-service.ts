import { createClient, createAdminClient } from "@/lib/supabase/server";
import type {
  PredictionMarketRow,
  PaymentRow,
  TokenLaunchRow,
  TaskRow,
  PredictionHistoryRow,
  PredictionResultStatus,
} from "@/lib/supabase/types";

// ─── Auth guard ───────────────────────────────────────────────────────────────

export async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_admin");
  return !!data;
}

// ─── Markets ──────────────────────────────────────────────────────────────────

export async function getAllMarkets(): Promise<PredictionMarketRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prediction_markets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) { console.error("[admin] getAllMarkets:", error.message); return []; }
  return data ?? [];
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function getAllPayments(
  status?: "pending" | "approved" | "rejected",
  flow?: string
): Promise<PaymentRow[]> {
  const supabase = createAdminClient() as any;
  let query = supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (flow) query = query.eq("flow", flow);
  const { data, error } = await query;
  if (error) { console.error("[admin] getAllPayments:", error.message); return []; }
  return data ?? [];
}

/** Pool winnings claims — from mutuel_bets, normalized to PaymentRow shape */
export async function getPoolClaims(
  status?: "pending" | "approved" | "rejected"
): Promise<PaymentRow[]> {
  const supabase = createAdminClient() as any;
  // pending = claimed_at set, paid_at null
  // approved = paid_at set
  let query = supabase
    .from("mutuel_bets")
    .select("id, wallet_address, amount, token, payout_amount, claimed_at, paid_at, created_at, mutuel_markets(title, slug)")
    .not("claimed_at", "is", null)
    .order("claimed_at", { ascending: false });

  if (status === "pending") query = query.is("paid_at", null);
  else if (status === "approved") query = query.not("paid_at", "is", null);

  const { data, error } = await query;
  if (error) { console.error("[admin] getPoolClaims:", error.message); return []; }

  return (data ?? []).map((b: any) => ({
    id: b.id,
    payment_request_id: b.id,
    payment_reference: null,
    flow: "pool_claim",
    title: b.mutuel_markets?.title ?? "Pool Claim",
    subtitle: null,
    username: null,
    user_wallet: b.wallet_address,
    recipient_wallet: b.wallet_address,
    amount_usdc: b.payout_amount ?? b.amount,
    reserve_fee_usdc: 0,
    total_paid_usdc: b.payout_amount ?? b.amount,
    token: b.token,
    status: b.paid_at ? "approved" : "pending",
    market_id: null,
    selection_id: null,
    selection_label: null,
    category_label: null,
    reviewed_at: b.paid_at ?? null,
    reviewed_by_wallet: null,
    created_at: b.claimed_at ?? b.created_at,
    updated_at: null,
  } as unknown as PaymentRow));
}

/** Up/Down winnings claims — from updown_bets, normalized to PaymentRow shape */
export async function getUpdownClaims(
  status?: "pending" | "approved" | "rejected"
): Promise<PaymentRow[]> {
  const supabase = createAdminClient() as any;
  let query = supabase
    .from("updown_bets")
    .select("id, wallet_address, amount, payout, direction, claimed_at, paid_at, created_at, updown_markets(symbol, duration_min)")
    .not("claimed_at", "is", null)
    .order("claimed_at", { ascending: false });

  if (status === "pending") query = query.is("paid_at", null);
  else if (status === "approved") query = query.not("paid_at", "is", null);

  const { data, error } = await query;
  if (error) { console.error("[admin] getUpdownClaims:", error.message); return []; }

  return (data ?? []).map((b: any) => ({
    id: b.id,
    payment_request_id: b.id,
    payment_reference: null,
    flow: "updown_claim",
    title: b.updown_markets
      ? `${b.updown_markets.symbol.replace("USDT", "")} ${b.updown_markets.duration_min}m — ${b.direction === "up" ? "↑ UP" : "↓ DOWN"}`
      : "Up/Down Claim",
    subtitle: null,
    username: null,
    user_wallet: b.wallet_address,
    recipient_wallet: b.wallet_address,
    amount_usdc: b.payout ?? b.amount,
    reserve_fee_usdc: 0,
    total_paid_usdc: b.payout ?? b.amount,
    token: "USDC",
    status: b.paid_at ? "approved" : "pending",
    market_id: null,
    selection_id: null,
    selection_label: null,
    category_label: null,
    reviewed_at: b.paid_at ?? null,
    reviewed_by_wallet: null,
    created_at: b.claimed_at ?? b.created_at,
    updated_at: null,
  } as unknown as PaymentRow));
}

export async function getPendingPaymentsCount(): Promise<number> {
  const supabase = createAdminClient() as any;
  const [{ data: p1 }, { data: p2 }, { data: p3 }] = await Promise.all([
    supabase.from("payments").select("id").eq("status", "pending"),
    supabase.from("mutuel_bets").select("id").not("claimed_at", "is", null).is("paid_at", null),
    supabase.from("updown_bets").select("id").not("claimed_at", "is", null).is("paid_at", null),
  ]);
  return ((p1 ?? []).length) + ((p2 ?? []).length) + ((p3 ?? []).length);
}

// ─── Pending bets (prediction markets + pools) ────────────────────────────────

export type BetWithStatus = PredictionHistoryRow & { result_status: PredictionResultStatus };

/** Pending prediction market payments (not yet turned into prediction_history rows) */
export async function getPendingPredictionPayments(): Promise<PaymentRow[]> {
  const supabase = createAdminClient() as any;
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("flow", "prediction")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) { console.error("[admin] getPendingPredictionPayments:", error.message); return []; }
  return data ?? [];
}

/** Pending pool prediction payments (not yet turned into mutuel_bets rows) */
export async function getPendingPoolPayments(): Promise<PaymentRow[]> {
  const supabase = createAdminClient() as any;
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("flow", "pool_prediction")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) { console.error("[admin] getPendingPoolPayments:", error.message); return []; }
  return data ?? [];
}

// ─── Updown bets ─────────────────────────────────────────────────────────────

export interface UpdownBetAdmin {
  id: string;
  market_id: string;
  wallet_address: string;
  direction: "up" | "down";
  amount: number;
  tx_signature: string;
  status: string;
  created_at: string;
  updown_markets: {
    symbol: string;
    duration_min: number;
    strike_price: number;
    closes_at: string;
    status: string;
  } | null;
}

export async function getPendingUpdownBets(): Promise<UpdownBetAdmin[]> {
  const supabase = createAdminClient() as any;
  const { data, error } = await supabase
    .from("updown_bets")
    .select("*, updown_markets(symbol, duration_min, strike_price, closes_at, status)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) { console.error("[admin] getPendingUpdownBets:", error.message); return []; }
  return data ?? [];
}

// ─── Token launches ───────────────────────────────────────────────────────────

export async function getAllLaunches(): Promise<TokenLaunchRow[]> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("token_launches")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) { console.error("[admin] getAllLaunches:", error.message); return []; }
  return data ?? [];
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function getAllTasks(): Promise<TaskRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) { console.error("[admin] getAllTasks:", error.message); return []; }
  return data ?? [];
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface AdminStats {
  totalMarkets: number;
  activeMarkets: number;
  resolvedMarkets: number;
  pendingPayments: number;
  pendingPaymentsPrediction: number;
  pendingPaymentsPools: number;
  pendingPaymentsPoolClaims: number;
  pendingLaunches: number;
  pendingBets: number;
  pendingPools: number;
  activePools: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const supabase = await createClient();

  const adminSupa = createAdminClient() as any;
  const [markets, allPendingPayments, launches, predPending, poolPending, poolClaims, pools] = await Promise.all([
    supabase.from("prediction_markets").select("is_resolved, is_active"),
    // all pending rows in payments table (any flow)
    adminSupa.from("payments").select("id").eq("status", "pending"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("token_launches").select("status"),
    adminSupa.from("payments").select("id").eq("flow", "prediction").eq("status", "pending"),
    adminSupa.from("payments").select("id").eq("flow", "pool_prediction").eq("status", "pending"),
    // pool claims pending = claimed_at set, paid_at null
    adminSupa.from("mutuel_bets").select("id").not("claimed_at", "is", null).is("paid_at", null),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("mutuel_markets").select("status"),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marketRows = (markets.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const launchRows = (launches.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const poolRows = (pools.data ?? []) as any[];
  const poolClaimsCount = (poolClaims.data ?? []).length;

  return {
    totalMarkets: marketRows.length,
    activeMarkets: marketRows.filter((m: any) => m.is_active && !m.is_resolved).length,
    resolvedMarkets: marketRows.filter((m: any) => m.is_resolved).length,
    pendingPayments: poolClaimsCount,
    pendingPaymentsPrediction: (predPending.data ?? []).length,
    pendingPaymentsPools: (poolPending.data ?? []).length,
    pendingPaymentsPoolClaims: poolClaimsCount,
    pendingLaunches: launchRows.filter((l: any) => l.status === "pending").length,
    pendingBets: (predPending.data ?? []).length,
    pendingPools: (poolPending.data ?? []).length,
    activePools: poolRows.filter((p: any) => p.status === "active").length,
  };
}

export interface ConnectedWalletRow {
  address: string;
  username: string | null;
  display_name: string | null;
  twitter_handle: string | null;
  avatar_src: string | null;
  role: string;
  status: string;
  first_connected_at: string;
  last_connected_at: string;
  latest_activity_at: string;
  connection_count: number;
  payment_count: number;
  approved_payment_count: number;
}

export async function getConnectedWallets(): Promise<ConnectedWalletRow[]> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("wallets")
    .select("address, username, display_name, twitter_handle, avatar_src, role, status, first_connected_at, last_connected_at, latest_activity_at, connection_count, payment_count, approved_payment_count")
    .order("latest_activity_at", { ascending: false });
  return data ?? [];
}

import { createClient } from "@/lib/supabase/server";
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

// ─── Payments (claims only) ───────────────────────────────────────────────────

export async function getAllPayments(
  status?: "pending" | "approved" | "rejected",
  flow?: "claim" | "launch" | "listing"
): Promise<PaymentRow[]> {
  const supabase = await createClient();
  // Only show claim/launch/listing flows — prediction bets go to /admin/bets
  let query = (supabase as any)
    .from("payments")
    .select("*")
    .not("flow", "in", '("prediction","pool_prediction")')
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (flow) query = query.eq("flow", flow);
  const { data, error } = await query;
  if (error) { console.error("[admin] getAllPayments:", error.message); return []; }
  return data ?? [];
}

export async function getPendingPaymentsCount(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from("payments")
    .select("id")
    .eq("status", "pending")
    .not("flow", "in", '("prediction","pool_prediction")');
  if (error) return 0;
  return (data ?? []).length;
}

// ─── Pending bets (prediction markets + pools) ────────────────────────────────

export type BetWithStatus = PredictionHistoryRow & { result_status: PredictionResultStatus };

/** Pending prediction market payments (not yet turned into prediction_history rows) */
export async function getPendingPredictionPayments(): Promise<PaymentRow[]> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
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
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from("payments")
    .select("*")
    .eq("flow", "pool_prediction")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) { console.error("[admin] getPendingPoolPayments:", error.message); return []; }
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
  totalPayments: number;
  pendingLaunches: number;
  pendingBets: number;
  pendingPools: number;
  activePools: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const supabase = await createClient();

  const [markets, payments, launches, predPending, poolPending, pools] = await Promise.all([
    supabase.from("prediction_markets").select("is_resolved, is_active"),
    (supabase as any)
      .from("payments")
      .select("status")
      .not("flow", "in", '("prediction","pool_prediction")'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("token_launches").select("status"),
    (supabase as any).from("payments").select("id").eq("flow", "prediction").eq("status", "pending"),
    (supabase as any).from("payments").select("id").eq("flow", "pool_prediction").eq("status", "pending"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("mutuel_markets").select("status"),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marketRows = (markets.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentRows = (payments.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const launchRows = (launches.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const poolRows = (pools.data ?? []) as any[];

  return {
    totalMarkets: marketRows.length,
    activeMarkets: marketRows.filter((m: any) => m.is_active && !m.is_resolved).length,
    resolvedMarkets: marketRows.filter((m: any) => m.is_resolved).length,
    pendingPayments: paymentRows.filter((p: any) => p.status === "pending").length,
    totalPayments: paymentRows.length,
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

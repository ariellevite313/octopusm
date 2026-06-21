/**
 * Admin Log Service — remplace octopus-central-registry.ts (adminLogs)
 * CRUD sur la table `admin_logs`
 */

import { supabase } from "../../lib/supabase";
import type { AdminLogRow, AdminAction } from "../../lib/supabase-types";

// ─── Lecture ──────────────────────────────────────────────────────────────────

export async function getAdminLogs(
  limit = 200
): Promise<AdminLogRow[]> {
  const { data, error } = await supabase
    .from("admin_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[admin-log-service] getAdminLogs:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getAdminLogsByWallet(
  adminWallet: string,
  limit = 100
): Promise<AdminLogRow[]> {
  const { data, error } = await supabase
    .from("admin_logs")
    .select("*")
    .eq("admin_wallet", adminWallet)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[admin-log-service] getAdminLogsByWallet:", error.message);
    return [];
  }
  return data ?? [];
}

// ─── Écriture ─────────────────────────────────────────────────────────────────

export async function addAdminLog(
  adminWallet: string,
  action: AdminAction,
  targetId: string,
  details: string
): Promise<{ success: boolean; error?: string }> {
  const id = `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { error } = await supabase.from("admin_logs").insert({
    id,
    admin_wallet: adminWallet,
    action,
    target_id: targetId,
    details,
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

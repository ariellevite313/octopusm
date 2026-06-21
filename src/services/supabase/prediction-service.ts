/**
 * Prediction Service — remplace prediction-market-store.ts
 * CRUD marchés de prédiction + historique des paris
 */

import { supabase } from "../../lib/supabase";
import type {
  PredictionMarketRow,
  PredictionHistoryRow,
  PredictionResultStatus,
} from "../../lib/supabase-types";

// ─── Marchés ──────────────────────────────────────────────────────────────────

export async function getActiveMarkets(): Promise<PredictionMarketRow[]> {
  const { data, error } = await supabase
    .from("prediction_markets")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[prediction-service] getActiveMarkets:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getMarketById(
  id: string
): Promise<PredictionMarketRow | null> {
  const { data, error } = await supabase
    .from("prediction_markets")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[prediction-service] getMarketById:", error.message);
    return null;
  }
  return data;
}

export async function getAllMarketsAdmin(): Promise<PredictionMarketRow[]> {
  const { data, error } = await supabase
    .from("prediction_markets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[prediction-service] getAllMarketsAdmin:", error.message);
    return [];
  }
  return data ?? [];
}

// ─── Admin : création / suppression / résolution ──────────────────────────────

export async function createMarket(
  market: Omit<PredictionMarketRow, "created_at" | "updated_at">
): Promise<{ success: boolean; data?: PredictionMarketRow; error?: string }> {
  const { data, error } = await supabase
    .from("prediction_markets")
    .insert(market)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function deleteMarket(
  id: string
): Promise<{ success: boolean; error?: string }> {
  // Désactivation logique (soft delete)
  const { error } = await supabase
    .from("prediction_markets")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function resolveMarket(
  marketId: string,
  outcomeId: string,
  resolvedByWallet: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("prediction_markets")
    .update({
      is_resolved: true,
      resolution_outcome_id: outcomeId,
      resolved_at: new Date().toISOString(),
      resolved_by_wallet: resolvedByWallet,
    })
    .eq("id", marketId);

  if (error) return { success: false, error: error.message };

  // Mettre à jour tous les paris liés à ce marché
  await updateBetsAfterResolution(marketId, outcomeId, resolvedByWallet);

  return { success: true };
}

// ─── Historique des paris ─────────────────────────────────────────────────────

export async function getPredictionHistory(
  walletAddress: string
): Promise<(PredictionHistoryRow & { result_status: PredictionResultStatus })[]> {
  const { data, error } = await supabase
    .from("prediction_history_with_status")
    .select("*")
    .eq("wallet_address", walletAddress)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[prediction-service] getPredictionHistory:", error.message);
    return [];
  }
  return (data ?? []) as (PredictionHistoryRow & { result_status: PredictionResultStatus })[];
}

export async function getAllPredictionHistoryAdmin(): Promise<
  (PredictionHistoryRow & { result_status: PredictionResultStatus })[]
> {
  const { data, error } = await supabase
    .from("prediction_history_with_status")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[prediction-service] getAllPredictionHistoryAdmin:", error.message);
    return [];
  }
  return (data ?? []) as (PredictionHistoryRow & { result_status: PredictionResultStatus })[];
}

export async function addPredictionHistoryEntry(
  entry: Omit<PredictionHistoryRow, "created_at" | "updated_at">
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from("prediction_history").insert(entry);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function claimPredictionWin(
  entryId: string,
  claimReference: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("prediction_history")
    .update({
      claimed_at: new Date().toISOString(),
      claim_reference: claimReference,
    })
    .eq("id", entryId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── Mise à jour des paris après résolution ───────────────────────────────────

async function updateBetsAfterResolution(
  marketId: string,
  outcomeId: string,
  resolvedByWallet: string
): Promise<void> {
  const now = new Date().toISOString();

  await supabase
    .from("prediction_history")
    .update({
      resolution_outcome_id: outcomeId,
      resolved_at: now,
      resolved_by_wallet: resolvedByWallet,
    })
    .eq("market_id", marketId)
    .eq("admin_decision_status", "approved");
}

// ─── Realtime ─────────────────────────────────────────────────────────────────

export function subscribeToMarkets(
  onUpdate: (market: PredictionMarketRow) => void
) {
  return supabase
    .channel("markets-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "prediction_markets" },
      (payload) => {
        if (payload.new) onUpdate(payload.new as PredictionMarketRow);
      }
    )
    .subscribe();
}

export function subscribeToPredictionHistory(
  walletAddress: string,
  onUpdate: (entry: PredictionHistoryRow) => void
) {
  return supabase
    .channel(`history-${walletAddress}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "prediction_history",
        filter: `wallet_address=eq.${walletAddress}`,
      },
      (payload) => {
        if (payload.new) onUpdate(payload.new as PredictionHistoryRow);
      }
    )
    .subscribe();
}

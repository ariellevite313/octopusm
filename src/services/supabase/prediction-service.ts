/**
 * Prediction Service — remplace prediction-market-store.ts
 * CRUD marchés de prédiction + historique des paris
 *
 * Les mutations admin (createMarket, deleteMarket, resolveMarket, markClaimAsPaid)
 * passent par des Edge Functions qui vérifient le wallet admin côté serveur
 * et utilisent service_role pour contourner les RLS restreintes.
 */

import { supabase } from "../../lib/supabase";
import { callAdminFunction } from "../../lib/supabase-admin";
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

/**
 * Crée un marché. Route vers l'Edge Function admin-create-market.
 * adminWallet est requis pour la vérification serveur.
 */
export async function createMarket(
  market: Omit<PredictionMarketRow, "created_at" | "updated_at">,
  adminWallet: string
): Promise<{ success: boolean; data?: PredictionMarketRow; error?: string }> {
  return callAdminFunction<PredictionMarketRow>(
    "admin-create-market",
    market as unknown as Record<string, unknown>,
    adminWallet
  );
}

/**
 * Désactivation logique d'un marché. Route vers l'Edge Function admin-delete-market.
 */
export async function deleteMarket(
  id: string,
  adminWallet: string
): Promise<{ success: boolean; error?: string }> {
  return callAdminFunction("admin-delete-market", { marketId: id }, adminWallet);
}

/**
 * Résout un marché et met à jour les paris. Route vers l'Edge Function admin-resolve-market.
 */
export async function resolveMarket(
  marketId: string,
  outcomeId: string,
  resolvedByWallet: string
): Promise<{ success: boolean; error?: string }> {
  return callAdminFunction("admin-resolve-market", {
    marketId,
    outcomeId,
    resolvedByWallet,
  }, resolvedByWallet);
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
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("prediction_history")
    .update({
      claimed_at: now,
      claim_reference: claimReference,
      payout_status: "claimed",
    })
    .eq("id", entryId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Marque un claim comme payé. Route vers l'Edge Function admin-mark-paid.
 * La mise à jour de payout_status='paid' est bloquée pour anon par RLS.
 */
export async function markClaimAsPaid(
  entryId: string,
  adminWallet: string
): Promise<{ success: boolean; error?: string }> {
  return callAdminFunction("admin-mark-paid", { entryId, adminWallet }, adminWallet);
}

export async function getClaimedPredictions(): Promise<PredictionHistoryRow[]> {
  // Requête sur la table de base (pas la vue) pour éviter les limitations
  // de filtrage PostgREST sur les colonnes calculées.
  const { data, error } = await supabase
    .from("prediction_history")
    .select("*")
    .not("claimed_at", "is", null)
    .order("claimed_at", { ascending: false });

  if (error) {
    console.error("[prediction-service] getClaimedPredictions:", error.message);
    return [];
  }
  return data ?? [];
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

/**
 * Récupère tous les marchés résolus (is_resolved = true), triés par date de résolution desc.
 * Utilisé par la page archive (/archive).
 */
export async function getResolvedMarkets(): Promise<PredictionMarketRow[]> {
  const { data, error } = await supabase
    .from("prediction_markets")
    .select("*")
    .eq("is_resolved", true)
    .order("resolved_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as PredictionMarketRow[];
}

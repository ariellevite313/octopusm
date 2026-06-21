/**
 * Listing Service — remplace ai-listing-store.ts
 * CRUD sur la table `ai_listings`
 */

import { supabase } from "../../lib/supabase";
import type { AIListingRow, AIListingBadge, AIListingStatus } from "../../lib/supabase-types";

// ─── Lecture publique ─────────────────────────────────────────────────────────

export async function getApprovedListings(): Promise<AIListingRow[]> {
  const { data, error } = await supabase
    .from("ai_listings")
    .select("*")
    .eq("status", "approved")
    .eq("visible_in_explore", true)
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("[listing-service] getApprovedListings:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getListingById(
  id: string
): Promise<AIListingRow | null> {
  const { data, error } = await supabase
    .from("ai_listings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[listing-service] getListingById:", error.message);
    return null;
  }
  return data;
}

// ─── Lecture par wallet ───────────────────────────────────────────────────────

export async function getListingsByWallet(
  walletAddress: string
): Promise<AIListingRow[]> {
  const { data, error } = await supabase
    .from("ai_listings")
    .select("*")
    .eq("wallet_address", walletAddress)
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("[listing-service] getListingsByWallet:", error.message);
    return [];
  }
  return data ?? [];
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function getAllListingsAdmin(): Promise<AIListingRow[]> {
  const { data, error } = await supabase
    .from("ai_listings")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("[listing-service] getAllListingsAdmin:", error.message);
    return [];
  }
  return data ?? [];
}

// ─── Création ─────────────────────────────────────────────────────────────────

export async function createListing(
  listing: Omit<AIListingRow, "submitted_at" | "updated_at">
): Promise<{ success: boolean; data?: AIListingRow; error?: string }> {
  const { data, error } = await supabase
    .from("ai_listings")
    .insert(listing)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// ─── Mise à jour ──────────────────────────────────────────────────────────────

export async function updateListingStatus(
  id: string,
  status: AIListingStatus,
  adminNotes?: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("ai_listings")
    .update({ status, admin_notes: adminNotes ?? null })
    .eq("id", id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updateListingBadge(
  id: string,
  badge: AIListingBadge
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("ai_listings")
    .update({ badge })
    .eq("id", id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function setListingVisible(
  id: string,
  visible: boolean
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("ai_listings")
    .update({ visible_in_explore: visible })
    .eq("id", id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── Compteur de visites ──────────────────────────────────────────────────────

/**
 * Incrémente le compteur de visites.
 * visitorKey = fingerprint côté client (ex: walletAddress ou hash localStorage)
 * Déduplication gérée côté serveur via une table optionnelle listing_visitor_keys.
 * Pour l'instant, on incrémente naïvement.
 */
export async function incrementListingVisit(
  id: string
): Promise<void> {
  // Utiliser une RPC ou un update atomique pour éviter les race conditions
  await supabase.rpc("increment_listing_visitor" as never, { listing_id: id });
}

// ─── Suppression ──────────────────────────────────────────────────────────────

export async function deleteListing(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from("ai_listings").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── Realtime ─────────────────────────────────────────────────────────────────

export function subscribeToListings(
  onUpdate: (listing: AIListingRow) => void
) {
  return supabase
    .channel("listings-changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "ai_listings",
        filter: "status=eq.approved",
      },
      (payload) => {
        if (payload.new) onUpdate(payload.new as AIListingRow);
      }
    )
    .subscribe();
}

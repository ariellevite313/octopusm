/**
 * Wallet Service — remplace octopus-central-registry.ts (wallets)
 * Toutes les opérations CRUD sur la table `wallets`
 */

import { supabase } from "../../lib/supabase";
import type { WalletRow } from "../../lib/supabase-types";

// ─── Types publics ────────────────────────────────────────────────────────────

export type WalletUpsertPayload = {
  address: string;
  role?: "user" | "admin";
  status?: "active" | "suspended";
  username?: string;
  displayName?: string;
  twitterHandle?: string;
  avatarSrc?: string;
  latestActivityLabel?: string;
};

// ─── Lecture ──────────────────────────────────────────────────────────────────

export async function getWallet(address: string): Promise<WalletRow | null> {
  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("address", address)
    .maybeSingle();

  if (error) {
    console.error("[wallet-service] getWallet:", error.message);
    return null;
  }
  return data;
}

export async function getAllWallets(): Promise<WalletRow[]> {
  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .order("latest_activity_at", { ascending: false });

  if (error) {
    console.error("[wallet-service] getAllWallets:", error.message);
    return [];
  }
  return data ?? [];
}

export async function isUsernameTaken(
  username: string,
  excludeAddress?: string
): Promise<boolean> {
  let query = supabase
    .from("wallets")
    .select("address")
    .ilike("username", username);

  if (excludeAddress) {
    query = query.neq("address", excludeAddress);
  }

  const { data, error } = await query.maybeSingle();
  if (error) return false;
  return !!data;
}

// ─── Création / mise à jour ───────────────────────────────────────────────────

/**
 * Crée ou met à jour l'enregistrement wallet.
 * Appelé à chaque connexion Phantom.
 */
export async function upsertWalletOnConnect(
  address: string
): Promise<WalletRow | null> {
  const now = new Date().toISOString();

  // Lire le wallet existant pour incrémenter les compteurs
  const existing = await getWallet(address);

  const payload = {
    address,
    first_connected_at: existing?.first_connected_at ?? now,
    last_connected_at: now,
    latest_activity_at: now,
    latest_activity_label: "Connected to Octopus Market",
    connection_count: (existing?.connection_count ?? 0) + 1,
  };

  const { data, error } = await supabase
    .from("wallets")
    .upsert(payload, { onConflict: "address" })
    .select()
    .single();

  if (error) {
    console.error("[wallet-service] upsertWalletOnConnect:", error.message);
    return null;
  }
  return data;
}

/**
 * Met à jour le profil utilisateur (username, displayName, etc.)
 */
export async function updateWalletProfile(
  address: string,
  updates: Pick<
    WalletUpsertPayload,
    "username" | "displayName" | "twitterHandle" | "avatarSrc"
  >
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("wallets")
    .update({
      username: updates.username,
      display_name: updates.displayName,
      twitter_handle: updates.twitterHandle,
      avatar_src: updates.avatarSrc,
    })
    .eq("address", address);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Met à jour l'activité du wallet (appelé après chaque action significative)
 */
export async function updateWalletActivity(
  address: string,
  label: string
): Promise<void> {
  await supabase
    .from("wallets")
    .update({
      latest_activity_at: new Date().toISOString(),
      latest_activity_label: label,
    })
    .eq("address", address);
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function updateWalletRole(
  address: string,
  role: "user" | "admin"
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("wallets")
    .update({ role })
    .eq("address", address);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function suspendWallet(
  address: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("wallets")
    .update({ status: "suspended" })
    .eq("address", address);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function reactivateWallet(
  address: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("wallets")
    .update({ status: "active" })
    .eq("address", address);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function refreshWalletStats(address: string): Promise<void> {
  await supabase.rpc("refresh_wallet_payment_stats", { p_wallet: address });
}

// ─── Realtime ─────────────────────────────────────────────────────────────────

export function subscribeToWallets(
  onUpdate: (wallet: WalletRow) => void
) {
  return supabase
    .channel("wallets-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "wallets" },
      (payload) => {
        if (payload.new) onUpdate(payload.new as WalletRow);
      }
    )
    .subscribe();
}

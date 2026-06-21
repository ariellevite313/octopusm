/**
 * ai-listing-store.ts — MIGRÉ VERS SUPABASE
 *
 * Remplace : localStorage (octopus-market-ai-listings-v2)
 * Par : Supabase table ai_listings
 *
 * Types conservés intacts. Cache mémoire populé par Supabase.
 */

import {
  getApprovedListings,
  getListingsByWallet,
  getAllListingsAdmin,
  createListing,
  updateListingStatus,
  updateListingBadge,
  setListingVisible,
  deleteListing,
  subscribeToListings,
} from "@/services/supabase/listing-service";
import type { AIListingRow } from "@/lib/supabase-types";

// ─── Types publics (inchangés) ────────────────────────────────────────────────

export type AIListingPlanId = "free" | "starter" | "builder";
export type AIListingStatus = "pending" | "approved" | "rejected";
export type AIListingBadge = "none" | "blue" | "gold";

export type AIListingSubmission = {
  id: string;
  walletAddress: string;
  displayName: string;
  twitterHandle: string;
  iconSrc: string;
  iconName: string;
  websiteUrl: string;
  description: string;
  socialUrl: string;
  guideFileName: string;
  guideFileUrl: string;
  planId: AIListingPlanId;
  billingLabel: string;
  amountUsd: number;
  autoRenewEnabled: boolean;
  submittedAt: number;
  updatedAt: number;
  status: AIListingStatus;
  badge: AIListingBadge;
  adminNotes?: string;
  paymentReference?: string;
  paymentRequestId?: string;
  visibleInExplore: boolean;
  visitorCount: number;
  uniqueVisitorKeys: string[];
};

// ─── Cache mémoire ────────────────────────────────────────────────────────────

let listingsCache: AIListingSubmission[] = [];
let hasHydrated = false;
const aiListingEventName = "octopus-market-ai-listings-updated";
let realtimeUnsub: (() => void) | null = null;

function emitUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(aiListingEventName));
  }
}

// ─── Conversions DB row ↔ app ─────────────────────────────────────────────────

function rowToApp(row: AIListingRow): AIListingSubmission {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    displayName: row.display_name,
    twitterHandle: row.twitter_handle,
    iconSrc: row.icon_src,
    iconName: row.icon_name,
    websiteUrl: row.website_url,
    description: row.description,
    socialUrl: row.social_url,
    guideFileName: row.guide_file_name,
    guideFileUrl: row.guide_file_url,
    planId: row.plan_id as AIListingPlanId,
    billingLabel: row.billing_label,
    amountUsd: Number(row.amount_usd),
    autoRenewEnabled: row.auto_renew_enabled,
    submittedAt: new Date(row.submitted_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    status: row.status as AIListingStatus,
    badge: row.badge as AIListingBadge,
    adminNotes: row.admin_notes ?? undefined,
    paymentReference: row.payment_reference ?? undefined,
    paymentRequestId: row.payment_request_id ?? undefined,
    visibleInExplore: row.visible_in_explore,
    visitorCount: row.visitor_count,
    uniqueVisitorKeys: [], // Ne plus stocker les clés en RAM — compteur géré en DB
  };
}

function appToRow(
  submission: AIListingSubmission
): Omit<AIListingRow, "submitted_at" | "updated_at"> {
  return {
    id: submission.id,
    wallet_address: submission.walletAddress,
    display_name: submission.displayName,
    twitter_handle: submission.twitterHandle,
    icon_src: submission.iconSrc,
    icon_name: submission.iconName,
    website_url: submission.websiteUrl,
    description: submission.description,
    social_url: submission.socialUrl,
    guide_file_name: submission.guideFileName,
    guide_file_url: submission.guideFileUrl,
    plan_id: submission.planId,
    billing_label: submission.billingLabel,
    amount_usd: submission.amountUsd,
    auto_renew_enabled: submission.autoRenewEnabled,
    status: submission.status,
    badge: submission.badge,
    admin_notes: submission.adminNotes ?? null,
    payment_reference: submission.paymentReference ?? null,
    payment_request_id: submission.paymentRequestId ?? null,
    visible_in_explore: submission.visibleInExplore,
    visitor_count: submission.visitorCount,
  };
}

// ─── Initialisation ───────────────────────────────────────────────────────────

/**
 * Charge les listings depuis Supabase.
 * Mode "public" : seulement les listings approuvés visibles.
 * Mode "admin" : tous les listings.
 */
export async function initAIListingStore(
  mode: "public" | "admin" | "wallet",
  walletAddress?: string
): Promise<void> {
  let rows: AIListingRow[];

  if (mode === "admin") {
    rows = await getAllListingsAdmin();
  } else if (mode === "wallet" && walletAddress) {
    rows = await getListingsByWallet(walletAddress);
  } else {
    rows = await getApprovedListings();
  }

  listingsCache = rows.map(rowToApp);
  hasHydrated = true;
  emitUpdate();

  // Realtime pour les listings approuvés (vue publique)
  if (mode === "public") {
    realtimeUnsub?.();
    const channel = subscribeToListings((updatedRow) => {
      const idx = listingsCache.findIndex((l) => l.id === updatedRow.id);
      const appListing = rowToApp(updatedRow);
      if (idx >= 0) {
        listingsCache[idx] = appListing;
      } else {
        listingsCache = [appListing, ...listingsCache];
      }
      emitUpdate();
    });
    realtimeUnsub = () => { void channel.unsubscribe(); };
  }
}

// ─── Lecture ──────────────────────────────────────────────────────────────────

export function readAIListings(): AIListingSubmission[] {
  return listingsCache;
}

export function readAIListingById(id: string): AIListingSubmission | null {
  return listingsCache.find((l) => l.id === id) ?? null;
}

// ─── Création ─────────────────────────────────────────────────────────────────

export async function submitAIListing(
  submission: AIListingSubmission
): Promise<{ success: boolean; error?: string }> {
  const result = await createListing(appToRow(submission));
  if (result.success && result.data) {
    listingsCache = [rowToApp(result.data), ...listingsCache];
    emitUpdate();
  }
  return { success: result.success, error: result.error };
}

// ─── Admin : mise à jour statut ───────────────────────────────────────────────

export async function approveAIListing(
  id: string,
  adminNotes?: string
): Promise<{ success: boolean; error?: string }> {
  const result = await updateListingStatus(id, "approved", adminNotes);
  if (result.success) {
    listingsCache = listingsCache.map((l) =>
      l.id === id ? { ...l, status: "approved" as const, adminNotes } : l
    );
    emitUpdate();
  }
  return result;
}

export async function rejectAIListing(
  id: string,
  adminNotes?: string
): Promise<{ success: boolean; error?: string }> {
  const result = await updateListingStatus(id, "rejected", adminNotes);
  if (result.success) {
    listingsCache = listingsCache.map((l) =>
      l.id === id ? { ...l, status: "rejected" as const, adminNotes } : l
    );
    emitUpdate();
  }
  return result;
}

export async function setAIListingBadge(
  id: string,
  badge: AIListingBadge
): Promise<{ success: boolean; error?: string }> {
  const result = await updateListingBadge(id, badge);
  if (result.success) {
    listingsCache = listingsCache.map((l) =>
      l.id === id ? { ...l, badge } : l
    );
    emitUpdate();
  }
  return result;
}

export async function setAIListingVisible(
  id: string,
  visible: boolean
): Promise<{ success: boolean; error?: string }> {
  const result = await setListingVisible(id, visible);
  if (result.success) {
    listingsCache = listingsCache.map((l) =>
      l.id === id ? { ...l, visibleInExplore: visible } : l
    );
    emitUpdate();
  }
  return result;
}

export async function removeAIListing(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const result = await deleteListing(id);
  if (result.success) {
    listingsCache = listingsCache.filter((l) => l.id !== id);
    emitUpdate();
  }
  return result;
}

// ─── Souscription (compatible composants existants) ───────────────────────────

export function subscribeToAIListingStore(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  if (!hasHydrated) {
    void initAIListingStore("public");
  }

  window.addEventListener(aiListingEventName, listener);
  return () => window.removeEventListener(aiListingEventName, listener);
}

// ─── Legacy (compatibilité) ───────────────────────────────────────────────────

/** @deprecated Utiliser submitAIListing */
export function writeAIListings(listings: AIListingSubmission[]): void {
  listingsCache = listings;
  emitUpdate();
}

// ─── Aliases de compatibilité ─────────────────────────────────────────────────

/** @deprecated → submitAIListing() */
export const appendAIListingSubmission = submitAIListing;

/** @deprecated → subscribeToAIListingStore() */
export const subscribeToAIListings = subscribeToAIListingStore;

/**
 * @deprecated — Accepte un updater callback (ancien pattern) ou un objet de mise à jour.
 */
export async function updateAIListingSubmission(
  id: string,
  updater:
    | ((listing: AIListingSubmission) => Partial<AIListingSubmission>)
    | Partial<Pick<AIListingSubmission, "status" | "badge" | "visibleInExplore" | "adminNotes">>
): Promise<{ success: boolean; error?: string }> {
  const current = listingsCache.find((l) => l.id === id);
  if (!current) return { success: false, error: "Listing introuvable" };

  const updates = typeof updater === "function" ? updater(current) : updater;

  if (updates.status) {
    const result = await updateListingStatus(id, updates.status as AIListingStatus, updates.adminNotes);
    if (!result.success) return result;
  }
  if (updates.badge) {
    const result = await updateListingBadge(id, updates.badge as AIListingBadge);
    if (!result.success) return result;
  }
  if (typeof updates.visibleInExplore === "boolean") {
    const result = await setListingVisible(id, updates.visibleInExplore);
    if (!result.success) return result;
  }

  listingsCache = listingsCache.map((l) =>
    l.id === id ? { ...l, ...updates } : l
  );
  emitUpdate();
  return { success: true };
}

/** @deprecated — Le compteur de visites est géré en DB. No-op. */
export async function trackAIListingVisit(_id: string, _actorKey?: string): Promise<void> {}

/** @deprecated — Retourne un profil de soumission vide avec les données du wallet */
export function getDefaultListingSubmissionProfile(
  walletRecord: string | { address: string; username?: string; twitterHandle?: string; avatarSrc?: string }
): AIListingSubmission {
  const now = Date.now();
  const address = typeof walletRecord === "string" ? walletRecord : walletRecord.address;
  const twitterHandle = typeof walletRecord === "string" ? "" : (walletRecord.twitterHandle ?? "");
  const displayName = typeof walletRecord === "string" ? "" : (walletRecord.username ?? "");

  return {
    id: crypto.randomUUID(),
    walletAddress: address,
    displayName,
    twitterHandle,
    iconSrc: "",
    iconName: "",
    websiteUrl: "",
    description: "",
    socialUrl: "",
    guideFileName: "",
    guideFileUrl: "",
    planId: "free",
    billingLabel: "Free",
    amountUsd: 0,
    autoRenewEnabled: false,
    submittedAt: now,
    updatedAt: now,
    status: "pending",
    badge: "none",
    visibleInExplore: false,
    visitorCount: 0,
    uniqueVisitorKeys: [],
  };
}

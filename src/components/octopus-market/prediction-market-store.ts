/**
 * prediction-market-store.ts — MIGRÉ VERS SUPABASE
 *
 * Remplace : localStorage + BroadcastChannel + SSE custom
 * Par : Supabase Database + Realtime
 *
 * Les types et signatures d'export sont conservés pour compatibilité.
 * Les fonctions sync retournent le cache mémoire (populé par Supabase).
 * Appeler initPredictionStore() au montage de l'app.
 */

import type { AdminPaymentStatus } from "@/components/octopus-market/octopus-admin";
import type { PredictionMarketQuestion } from "@/components/octopus-market/octopus-market-data";
import {
  getActiveMarkets,
  getAllMarketsAdmin,
  createMarket,
  deleteMarket,
  resolveMarket,
  getPredictionHistory,
  addPredictionHistoryEntry,
  claimPredictionWin,
  subscribeToMarkets,
  subscribeToPredictionHistory,
} from "@/services/supabase/prediction-service";
import type {
  PredictionMarketRow,
  PredictionHistoryRow,
} from "@/lib/supabase-types";

// ─── Types publics (inchangés) ────────────────────────────────────────────────

export type PredictionResultStatus =
  | "open"
  | "pending_review"
  | "approved_pending_result"
  | "win"
  | "lose"
  | "claimed"
  | "rejected";

export type PredictionHistoryEntry = {
  id: string;
  marketId: string;
  marketTitle: string;
  categoryLabel: string;
  selectionId: string;
  selectionLabel: string;
  amount: number;
  reserveFee: number;
  totalCharged: number;
  claimFeeRate: number;
  payoutMultiple: number;
  grossReward: number;
  netReward: number;
  walletAddress: string;
  paymentReference: string;
  paymentRequestId: string;
  createdAt: number;
  reportedAt: number;
  adminDecisionStatus?: AdminPaymentStatus;
  resolutionOutcomeId?: string;
  resolvedAt?: number;
  resolvedByWallet?: string;
  resultStatus?: PredictionResultStatus;
  winningChoiceLabel?: string;
  payoutRecordedAt?: number;
  claimedAt?: number;
  claimReference?: string;
};

export type PredictionResolutionRecord = {
  outcomeId: string;
  resolvedAt: number;
  resolvedByWallet: string;
};

export type AdminCreatedPredictionMarket = PredictionMarketQuestion & {
  createdAt: number;
  createdByWallet: string;
  isAdminCreated: true;
};

// ─── Cache mémoire (populé par Supabase) ─────────────────────────────────────

let predictionMarketsCache: AdminCreatedPredictionMarket[] = [];
let predictionResolutionsCache: Record<string, PredictionResolutionRecord> = {};
let predictionHistoryCache: PredictionHistoryEntry[] = [];
let hasHydrated = false;
let activeWalletAddress: string | null = null;

let realtimeMarketsUnsub: (() => void) | null = null;
let realtimeHistoryUnsub: (() => void) | null = null;

// Événement dispatché lors de toute mise à jour (compatible avec les composants existants)
const predictionMarketStorageEventName = "octopus-market-prediction-storage";

function emitUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(predictionMarketStorageEventName));
  }
}

// ─── Conversions DB row ↔ app types ──────────────────────────────────────────

function marketRowToApp(row: PredictionMarketRow): AdminCreatedPredictionMarket {
  const options = Array.isArray(row.options) ? row.options : [];
  return {
    id: row.id,
    categoryId: row.category_id,
    title: row.title,
    marketType: row.market_type as PredictionMarketQuestion["marketType"],
    resolutionLabel: row.resolution_label,
    eventDateLabel: row.event_date_label ?? undefined,
    visualType: row.visual_type as PredictionMarketQuestion["visualType"],
    singleName: row.single_name ?? undefined,
    singleImageSrc: row.single_image_src ?? undefined,
    leftCompetitorName: row.left_competitor_name ?? undefined,
    leftCompetitorImageSrc: row.left_competitor_image_src ?? undefined,
    rightCompetitorName: row.right_competitor_name ?? undefined,
    rightCompetitorImageSrc: row.right_competitor_image_src ?? undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: options as any,
    createdAt: new Date(row.created_at).getTime(),
    createdByWallet: row.created_by_wallet ?? "",
    isAdminCreated: true as const,
  };
}

function historyRowToApp(
  row: PredictionHistoryRow & { result_status?: PredictionResultStatus }
): PredictionHistoryEntry {
  return {
    id: row.id,
    marketId: row.market_id,
    marketTitle: row.market_title,
    categoryLabel: row.category_label,
    selectionId: row.selection_id,
    selectionLabel: row.selection_label,
    amount: Number(row.amount),
    reserveFee: Number(row.reserve_fee),
    totalCharged: Number(row.total_charged),
    claimFeeRate: Number(row.claim_fee_rate),
    payoutMultiple: Number(row.payout_multiple),
    grossReward: Number(row.gross_reward),
    netReward: Number(row.net_reward),
    walletAddress: row.wallet_address,
    paymentReference: row.payment_reference,
    paymentRequestId: row.payment_request_id,
    createdAt: new Date(row.created_at).getTime(),
    reportedAt: new Date(row.reported_at).getTime(),
    adminDecisionStatus: (row.admin_decision_status as AdminPaymentStatus) ?? "pending",
    resolutionOutcomeId: row.resolution_outcome_id ?? undefined,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).getTime() : undefined,
    resolvedByWallet: row.resolved_by_wallet ?? undefined,
    resultStatus: row.result_status,
    payoutRecordedAt: row.payout_recorded_at
      ? new Date(row.payout_recorded_at).getTime()
      : undefined,
    claimedAt: row.claimed_at ? new Date(row.claimed_at).getTime() : undefined,
    claimReference: row.claim_reference ?? undefined,
  };
}

function entryToDbRow(
  entry: PredictionHistoryEntry
): Omit<PredictionHistoryRow, "created_at" | "updated_at"> {
  return {
    id: entry.id,
    market_id: entry.marketId,
    market_title: entry.marketTitle,
    category_label: entry.categoryLabel,
    selection_id: entry.selectionId,
    selection_label: entry.selectionLabel,
    amount: entry.amount,
    reserve_fee: entry.reserveFee,
    total_charged: entry.totalCharged,
    claim_fee_rate: entry.claimFeeRate,
    payout_multiple: entry.payoutMultiple,
    gross_reward: entry.grossReward,
    net_reward: entry.netReward,
    wallet_address: entry.walletAddress,
    payment_reference: entry.paymentReference,
    payment_request_id: entry.paymentRequestId,
    admin_decision_status: entry.adminDecisionStatus ?? "pending",
    resolution_outcome_id: entry.resolutionOutcomeId ?? null,
    resolved_at: entry.resolvedAt ? new Date(entry.resolvedAt).toISOString() : null,
    resolved_by_wallet: entry.resolvedByWallet ?? null,
    payout_recorded_at: entry.payoutRecordedAt
      ? new Date(entry.payoutRecordedAt).toISOString()
      : null,
    claimed_at: entry.claimedAt ? new Date(entry.claimedAt).toISOString() : null,
    claim_reference: entry.claimReference ?? null,
    reported_at: new Date(entry.reportedAt).toISOString(),
  };
}

// ─── Initialisation ───────────────────────────────────────────────────────────

/**
 * À appeler une fois au montage de l'application (dans App.tsx ou un provider).
 * Charge les marchés + l'historique depuis Supabase et démarre les subscriptions Realtime.
 */
export async function initPredictionStore(walletAddress?: string | null): Promise<void> {
  activeWalletAddress = walletAddress ?? null;

  // Charger les marchés
  const markets = await getActiveMarkets();
  predictionMarketsCache = markets.map(marketRowToApp);

  // Construire le cache des résolutions
  predictionResolutionsCache = {};
  for (const market of markets) {
    if (market.is_resolved && market.resolution_outcome_id) {
      predictionResolutionsCache[market.id] = {
        outcomeId: market.resolution_outcome_id,
        resolvedAt: market.resolved_at ? new Date(market.resolved_at).getTime() : Date.now(),
        resolvedByWallet: market.resolved_by_wallet ?? "",
      };
    }
  }

  // Charger l'historique si un wallet est fourni
  if (walletAddress) {
    const history = await getPredictionHistory(walletAddress);
    predictionHistoryCache = history.map(historyRowToApp);
  }

  hasHydrated = true;
  emitUpdate();

  // Subscriptions Realtime
  startRealtimeSync(walletAddress ?? null);
}

function startRealtimeSync(walletAddress: string | null): void {
  // Cleanup précédent
  realtimeMarketsUnsub?.();
  realtimeHistoryUnsub?.();

  const marketsChannel = subscribeToMarkets((updatedRow) => {
    const idx = predictionMarketsCache.findIndex((m) => m.id === updatedRow.id);
    const appMarket = marketRowToApp(updatedRow);
    if (idx >= 0) {
      predictionMarketsCache[idx] = appMarket;
    } else {
      predictionMarketsCache = [appMarket, ...predictionMarketsCache];
    }

    // Mise à jour des résolutions
    if (updatedRow.is_resolved && updatedRow.resolution_outcome_id) {
      predictionResolutionsCache[updatedRow.id] = {
        outcomeId: updatedRow.resolution_outcome_id,
        resolvedAt: updatedRow.resolved_at
          ? new Date(updatedRow.resolved_at).getTime()
          : Date.now(),
        resolvedByWallet: updatedRow.resolved_by_wallet ?? "",
      };
    }

    emitUpdate();
  });

  realtimeMarketsUnsub = () => { void marketsChannel.unsubscribe(); };

  if (walletAddress) {
    const historyChannel = subscribeToPredictionHistory(walletAddress, (updatedRow) => {
      const idx = predictionHistoryCache.findIndex((e) => e.id === updatedRow.id);
      const appEntry = historyRowToApp(updatedRow);
      if (idx >= 0) {
        predictionHistoryCache[idx] = appEntry;
      } else {
        predictionHistoryCache = [appEntry, ...predictionHistoryCache];
      }
      emitUpdate();
    });
    realtimeHistoryUnsub = () => { void historyChannel.unsubscribe(); };
  }
}

// ─── Admin : initialisation complète (inclut les marchés inactifs) ────────────

export async function initPredictionStoreAdmin(): Promise<void> {
  const markets = await getAllMarketsAdmin();
  predictionMarketsCache = markets.map(marketRowToApp);
  predictionResolutionsCache = {};
  for (const market of markets) {
    if (market.is_resolved && market.resolution_outcome_id) {
      predictionResolutionsCache[market.id] = {
        outcomeId: market.resolution_outcome_id,
        resolvedAt: market.resolved_at ? new Date(market.resolved_at).getTime() : Date.now(),
        resolvedByWallet: market.resolved_by_wallet ?? "",
      };
    }
  }
  hasHydrated = true;
  emitUpdate();
}

// ─── Lecture (synchrone sur le cache) ────────────────────────────────────────

export function readPredictionHistory(): PredictionHistoryEntry[] {
  return predictionHistoryCache;
}

export function readPredictionResolutions(): Record<string, PredictionResolutionRecord> {
  return predictionResolutionsCache;
}

export function readAdminCreatedPredictionMarkets(): AdminCreatedPredictionMarket[] {
  return predictionMarketsCache;
}

// ─── Historique : écriture ────────────────────────────────────────────────────

export async function appendPredictionHistoryEntry(
  entry: PredictionHistoryEntry
): Promise<PredictionHistoryEntry[]> {
  if (predictionHistoryCache.some((e) => e.paymentReference === entry.paymentReference)) {
    return predictionHistoryCache;
  }

  await addPredictionHistoryEntry(entryToDbRow(entry));
  predictionHistoryCache = [entry, ...predictionHistoryCache];
  emitUpdate();
  return predictionHistoryCache;
}

export async function updatePredictionHistoryEntry(
  entryId: string,
  updater: (entry: PredictionHistoryEntry) => PredictionHistoryEntry
): Promise<PredictionHistoryEntry[]> {
  predictionHistoryCache = predictionHistoryCache.map((e) =>
    e.id === entryId ? updater(e) : e
  );
  emitUpdate();
  return predictionHistoryCache;
}

export async function claimPredictionEntry(
  entryId: string,
  claimReference: string
): Promise<{ success: boolean; error?: string }> {
  const result = await claimPredictionWin(entryId, claimReference);
  if (result.success) {
    predictionHistoryCache = predictionHistoryCache.map((e) =>
      e.id === entryId
        ? { ...e, claimedAt: Date.now(), claimReference, resultStatus: "claimed" as const }
        : e
    );
    emitUpdate();
  }
  return result;
}

// ─── Sync admin decision (appelé depuis le panel admin) ──────────────────────

export function syncPredictionEntriesForAdminDecision(
  paymentReference: string,
  status: AdminPaymentStatus
): PredictionHistoryEntry[] {
  predictionHistoryCache = predictionHistoryCache.map((e) =>
    e.paymentReference === paymentReference
      ? { ...e, adminDecisionStatus: status }
      : e
  );
  emitUpdate();
  return predictionHistoryCache;
}

export function syncPredictionEntriesForResolvedMarket(
  params: PredictionResolutionRecord & { marketId: string }
): PredictionHistoryEntry[] {
  predictionHistoryCache = predictionHistoryCache.map((e) => {
    if (e.marketId !== params.marketId) return e;
    return {
      ...e,
      resolutionOutcomeId: params.outcomeId,
      resolvedAt: params.resolvedAt,
      resolvedByWallet: params.resolvedByWallet,
      payoutRecordedAt:
        params.outcomeId === e.selectionId ? params.resolvedAt : e.payoutRecordedAt,
    };
  });

  predictionResolutionsCache = {
    ...predictionResolutionsCache,
    [params.marketId]: {
      outcomeId: params.outcomeId,
      resolvedAt: params.resolvedAt,
      resolvedByWallet: params.resolvedByWallet,
    },
  };

  emitUpdate();
  return predictionHistoryCache;
}

// ─── Admin : marchés ─────────────────────────────────────────────────────────

export async function appendAdminCreatedPredictionMarket(
  market: AdminCreatedPredictionMarket,
  _adminWalletAddress?: string | null
): Promise<AdminCreatedPredictionMarket[]> {
  if (predictionMarketsCache.some((m) => m.id === market.id)) {
    return predictionMarketsCache;
  }

  const dbMarket = {
    id: market.id,
    category_id: market.categoryId,
    title: market.title,
    market_type: market.marketType,
    resolution_label: market.resolutionLabel,
    event_date_label: market.eventDateLabel ?? null,
    visual_type: market.visualType,
    single_name: market.singleName ?? null,
    single_image_src: market.singleImageSrc ?? null,
    left_competitor_name: market.leftCompetitorName ?? null,
    left_competitor_image_src: market.leftCompetitorImageSrc ?? null,
    right_competitor_name: market.rightCompetitorName ?? null,
    right_competitor_image_src: market.rightCompetitorImageSrc ?? null,
    options: market.options as unknown as import("@/lib/supabase-types").Json,
    created_by_wallet: market.createdByWallet,
    is_resolved: false,
    resolution_outcome_id: null,
    resolved_at: null,
    resolved_by_wallet: null,
    is_active: true,
  };

  const result = await createMarket(dbMarket);
  if (result.success) {
    predictionMarketsCache = [market, ...predictionMarketsCache];
    emitUpdate();
  }

  return predictionMarketsCache;
}

export async function removeAdminCreatedPredictionMarket(
  marketId: string,
  _adminWalletAddress?: string | null
): Promise<AdminCreatedPredictionMarket[]> {
  await deleteMarket(marketId);
  predictionMarketsCache = predictionMarketsCache.filter((m) => m.id !== marketId);

  if (predictionResolutionsCache[marketId]) {
    const next = { ...predictionResolutionsCache };
    delete next[marketId];
    predictionResolutionsCache = next;
  }

  emitUpdate();
  return predictionMarketsCache;
}

export async function resolveAdminCreatedPredictionMarket(
  marketId: string,
  outcomeId: string,
  adminWalletAddress: string
): Promise<{ success: boolean; error?: string }> {
  const result = await resolveMarket(marketId, outcomeId, adminWalletAddress);

  if (result.success) {
    predictionResolutionsCache = {
      ...predictionResolutionsCache,
      [marketId]: {
        outcomeId,
        resolvedAt: Date.now(),
        resolvedByWallet: adminWalletAddress,
      },
    };

    predictionMarketsCache = predictionMarketsCache.map((m) =>
      m.id === marketId ? { ...m, isResolved: true } : m
    );

    syncPredictionEntriesForResolvedMarket({
      marketId,
      outcomeId,
      resolvedAt: Date.now(),
      resolvedByWallet: adminWalletAddress,
    });
  }

  return result;
}

// ─── Écriture legacy (compatibilité — redirigent vers les nouvelles fonctions) ─

/** @deprecated Utiliser appendPredictionHistoryEntry (async) */
export function writePredictionHistory(history: PredictionHistoryEntry[]): void {
  predictionHistoryCache = history;
  emitUpdate();
}

/** @deprecated Utiliser removeAdminCreatedPredictionMarket (async) */
export function writeAdminCreatedPredictionMarkets(
  markets: AdminCreatedPredictionMarket[]
): void {
  predictionMarketsCache = markets;
  emitUpdate();
}

/** @deprecated */
export async function createPredictionMarketOnServer(
  market: AdminCreatedPredictionMarket,
  adminWalletAddress?: string | null
): Promise<{
  markets: AdminCreatedPredictionMarket[];
  resolutions: Record<string, PredictionResolutionRecord>;
} | null> {
  await appendAdminCreatedPredictionMarket(market, adminWalletAddress);
  return { markets: predictionMarketsCache, resolutions: predictionResolutionsCache };
}

/** @deprecated */
export async function resolvePredictionMarketOnServer(
  marketId: string,
  outcomeId: string,
  adminWalletAddress?: string | null
): Promise<{
  markets: AdminCreatedPredictionMarket[];
  resolutions: Record<string, PredictionResolutionRecord>;
} | null> {
  if (adminWalletAddress) {
    await resolveAdminCreatedPredictionMarket(marketId, outcomeId, adminWalletAddress);
  }
  return { markets: predictionMarketsCache, resolutions: predictionResolutionsCache };
}

/** @deprecated */
export async function deletePredictionMarketOnServer(
  marketId: string,
  adminWalletAddress?: string | null
): Promise<{
  markets: AdminCreatedPredictionMarket[];
  resolutions: Record<string, PredictionResolutionRecord>;
} | null> {
  await removeAdminCreatedPredictionMarket(marketId, adminWalletAddress);
  return { markets: predictionMarketsCache, resolutions: predictionResolutionsCache };
}

/** @deprecated */
export async function persistPredictionMarketStateToServer(): Promise<boolean> {
  return true; // Supabase gère la persistance automatiquement
}

/**
 * @deprecated — Supabase gère la persistance automatiquement.
 * Retourne le cache courant pour compatibilité avec binary-prediction-studio.tsx.
 */
export async function commitPredictionMarketStateToServer(): Promise<{
  markets: AdminCreatedPredictionMarket[];
  resolutions: Record<string, PredictionResolutionRecord>;
}> {
  return {
    markets: predictionMarketsCache,
    resolutions: predictionResolutionsCache,
  };
}

// ─── Souscription (compatible avec les composants existants) ─────────────────

export function subscribeToPredictionMarketStorage(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  if (!hasHydrated) {
    void initPredictionStore(activeWalletAddress);
  }

  window.addEventListener(predictionMarketStorageEventName, listener);
  return () => window.removeEventListener(predictionMarketStorageEventName, listener);
}

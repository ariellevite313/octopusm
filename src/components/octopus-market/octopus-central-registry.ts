/**
 * octopus-central-registry.ts — MIGRÉ VERS SUPABASE
 *
 * Remplace : IndexedDB + localStorage fallback + BroadcastChannel + SSE
 * Par : Supabase (wallets, payments, admin_logs) + Realtime
 *
 * Tous les types et signatures d'export sont conservés pour compatibilité.
 */

import type { AdminPaymentNotification } from "@/components/octopus-market/octopus-admin";
import type { PredictionHistoryEntry } from "@/components/octopus-market/prediction-market-store";
import {
  getWallet,
  getAllWallets,
  upsertWalletOnConnect,
  updateWalletActivity,
  updateWalletProfile,
  suspendWallet,
  reactivateWallet,
  subscribeToWallets,
} from "@/services/supabase/wallet-service";
import {
  getAllPaymentsAdmin,
  createPaymentNotification,
} from "@/services/supabase/payment-service";
import {
  getAdminLogs,
  addAdminLog,
} from "@/services/supabase/admin-log-service";
import type { WalletRow, PaymentRow, AdminLogRow } from "@/lib/supabase-types";

// ─── Types publics (inchangés) ────────────────────────────────────────────────

export type RegistryWalletRole = "user" | "admin";
export type RegistryWalletStatus = "active" | "suspended";

export type RegistryWalletRecord = {
  address: string;
  role: RegistryWalletRole;
  status: RegistryWalletStatus;
  username?: string;
  displayName?: string;
  twitterHandle?: string;
  avatarSrc?: string;
  registeredAt?: number;
  firstConnectedAt: number;
  lastConnectedAt: number;
  connectionCount: number;
  latestActivityAt: number;
  latestActivityLabel: string;
  paymentCount: number;
  approvedPaymentCount: number;
  pendingPaymentCount: number;
  rejectedPaymentCount: number;
  totalPaidUsdc: number;
  totalWonUsdc: number;
  totalLostUsdc: number;
  totalClaimedUsdc: number;
};

export type RegistryPaymentRecord = AdminPaymentNotification & {
  updatedAt: number;
};

export type RegistryBetRecord = PredictionHistoryEntry & {
  updatedAt: number;
};

export type RegistryHistoryRecord = PredictionHistoryEntry & {
  updatedAt: number;
};

export type RegistryAdminLogRecord = {
  id: string;
  adminWallet: string;
  action:
    | "create_prediction"
    | "remove_prediction"
    | "resolve_prediction"
    | "remove_ai"
    | "approve_listing"
    | "reject_listing"
    | "suspend_user"
    | "reactivate_user"
    | "approve_payment"
    | "reject_payment"
    | "add_ai";
  targetId: string;
  details: string;
  createdAt: number;
};

type WalletActivityOptions = {
  role?: RegistryWalletRole;
  timestamp?: number;
  latestActivityLabel?: string;
};

// ─── Caches mémoire ───────────────────────────────────────────────────────────

let walletsCache: RegistryWalletRecord[] = [];
let paymentsCache: RegistryPaymentRecord[] = [];
let adminLogsCache: RegistryAdminLogRecord[] = [];
let hasHydratedWallets = false;
let hasHydratedPayments = false;
let hasHydratedLogs = false;

const registryEventName = "octopus-market-central-registry-update";
let realtimeWalletsUnsub: (() => void) | null = null;

function emitRegistryUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(registryEventName));
  }
}

// ─── Conversions DB row ↔ app ─────────────────────────────────────────────────

function walletRowToRegistry(row: WalletRow): RegistryWalletRecord {
  return {
    address: row.address,
    role: row.role as RegistryWalletRole,
    status: row.status as RegistryWalletStatus,
    username: row.username ?? undefined,
    displayName: row.display_name ?? undefined,
    twitterHandle: row.twitter_handle ?? undefined,
    avatarSrc: row.avatar_src ?? undefined,
    registeredAt: row.registered_at ? new Date(row.registered_at).getTime() : undefined,
    firstConnectedAt: new Date(row.first_connected_at).getTime(),
    lastConnectedAt: new Date(row.last_connected_at).getTime(),
    connectionCount: row.connection_count,
    latestActivityAt: new Date(row.latest_activity_at).getTime(),
    latestActivityLabel: row.latest_activity_label,
    paymentCount: row.payment_count,
    approvedPaymentCount: row.approved_payment_count,
    pendingPaymentCount: row.pending_payment_count,
    rejectedPaymentCount: row.rejected_payment_count,
    totalPaidUsdc: Number(row.total_paid_usdc),
    totalWonUsdc: Number(row.total_won_usdc),
    totalLostUsdc: Number(row.total_lost_usdc),
    totalClaimedUsdc: Number(row.total_claimed_usdc),
  };
}

function paymentRowToRegistry(row: PaymentRow): RegistryPaymentRecord {
  return {
    id: row.id,
    paymentRequestId: row.payment_request_id,
    paymentReference: row.payment_reference,
    flow: row.flow as "prediction" | "launch" | "listing",
    title: row.title,
    subtitle: row.subtitle ?? undefined,
    categoryLabel: row.category_label ?? undefined,
    marketId: row.market_id ?? undefined,
    selectionId: row.selection_id ?? undefined,
    selectionLabel: row.selection_label ?? undefined,
    username: row.username ?? undefined,
    userWallet: row.user_wallet,
    recipientWallet: row.recipient_wallet,
    amountUsdc: Number(row.amount_usdc),
    reserveFeeUsdc: Number(row.reserve_fee_usdc),
    totalPaidUsdc: Number(row.total_paid_usdc),
    status: row.status as "pending" | "approved" | "rejected",
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).getTime() : undefined,
    reviewedByWallet: row.reviewed_by_wallet ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function adminLogRowToRegistry(row: AdminLogRow): RegistryAdminLogRecord {
  return {
    id: row.id,
    adminWallet: row.admin_wallet,
    action: row.action as RegistryAdminLogRecord["action"],
    targetId: row.target_id,
    details: row.details,
    createdAt: new Date(row.created_at).getTime(),
  };
}

// ─── Initialisation ───────────────────────────────────────────────────────────

export async function initCentralRegistry(): Promise<void> {
  const [wallets, payments, logs] = await Promise.all([
    getAllWallets(),
    getAllPaymentsAdmin(),
    getAdminLogs(),
  ]);

  walletsCache = wallets.map(walletRowToRegistry);
  paymentsCache = payments.map(paymentRowToRegistry);
  adminLogsCache = logs.map(adminLogRowToRegistry);

  hasHydratedWallets = true;
  hasHydratedPayments = true;
  hasHydratedLogs = true;

  emitRegistryUpdate();
  startRealtimeSync();
}

function startRealtimeSync(): void {
  realtimeWalletsUnsub?.();
  const channel = subscribeToWallets((updatedRow) => {
    const idx = walletsCache.findIndex((w) => w.address === updatedRow.address);
    const record = walletRowToRegistry(updatedRow);
    if (idx >= 0) {
      walletsCache[idx] = record;
    } else {
      walletsCache = [record, ...walletsCache];
    }
    emitRegistryUpdate();
  });
  realtimeWalletsUnsub = () => { void channel.unsubscribe(); };
}

// ─── Lecture wallets ──────────────────────────────────────────────────────────

export function readCachedCentralWalletRecord(
  address: string
): RegistryWalletRecord | null {
  return walletsCache.find((w) => w.address === address) ?? null;
}

export async function readCentralWalletRecord(
  address: string
): Promise<RegistryWalletRecord | null> {
  const cached = readCachedCentralWalletRecord(address);
  if (cached) return cached;

  const row = await getWallet(address);
  if (!row) return null;

  const record = walletRowToRegistry(row);
  walletsCache = [record, ...walletsCache.filter((w) => w.address !== address)];
  return record;
}

export function readAllCentralWalletRecords(): RegistryWalletRecord[] {
  if (!hasHydratedWallets) {
    void initCentralRegistry();
  }
  return walletsCache;
}

// ─── Lecture paiements ────────────────────────────────────────────────────────

export function readAllCentralPaymentRecords(): RegistryPaymentRecord[] {
  if (!hasHydratedPayments) {
    void initCentralRegistry();
  }
  return paymentsCache;
}

// ─── Lecture logs admin ───────────────────────────────────────────────────────

export function readAllCentralAdminLogRecords(): RegistryAdminLogRecord[] {
  if (!hasHydratedLogs) {
    void initCentralRegistry();
  }
  return adminLogsCache;
}

// ─── Écriture wallet ──────────────────────────────────────────────────────────

export async function upsertWalletActivityToCentralRegistry(
  address: string,
  options: WalletActivityOptions = {}
): Promise<RegistryWalletRecord | null> {
  const label = options.latestActivityLabel ?? "Connected to Octopus Market";

  // Upsert dans Supabase
  const row = await upsertWalletOnConnect(address);
  if (!row) return null;

  await updateWalletActivity(address, label);

  const record = walletRowToRegistry({ ...row, latest_activity_label: label });
  const idx = walletsCache.findIndex((w) => w.address === address);
  if (idx >= 0) {
    walletsCache[idx] = record;
  } else {
    walletsCache = [record, ...walletsCache];
  }

  emitRegistryUpdate();
  return record;
}

export async function suspendWalletInRegistry(
  address: string
): Promise<{ success: boolean; error?: string }> {
  const result = await suspendWallet(address);
  if (result.success) {
    walletsCache = walletsCache.map((w) =>
      w.address === address ? { ...w, status: "suspended" as const } : w
    );
    emitRegistryUpdate();
  }
  return result;
}

export async function reactivateWalletInRegistry(
  address: string
): Promise<{ success: boolean; error?: string }> {
  const result = await reactivateWallet(address);
  if (result.success) {
    walletsCache = walletsCache.map((w) =>
      w.address === address ? { ...w, status: "active" as const } : w
    );
    emitRegistryUpdate();
  }
  return result;
}

// ─── Écriture paiements ───────────────────────────────────────────────────────

export async function appendPaymentToCentralRegistry(
  payment: AdminPaymentNotification
): Promise<void> {
  await createPaymentNotification({
    id: payment.id,
    payment_request_id: payment.paymentRequestId,
    payment_reference: payment.paymentReference,
    flow: payment.flow,
    title: payment.title,
    subtitle: payment.subtitle ?? null,
    category_label: payment.categoryLabel ?? null,
    market_id: payment.marketId ?? null,
    selection_id: payment.selectionId ?? null,
    selection_label: payment.selectionLabel ?? null,
    username: payment.username ?? null,
    user_wallet: payment.userWallet,
    recipient_wallet: payment.recipientWallet,
    amount_usdc: payment.amountUsdc,
    reserve_fee_usdc: payment.reserveFeeUsdc,
    total_paid_usdc: payment.totalPaidUsdc,
    status: payment.status,
    reviewed_at: payment.reviewedAt ? new Date(payment.reviewedAt).toISOString() : null,
    reviewed_by_wallet: payment.reviewedByWallet ?? null,
  });

  const record: RegistryPaymentRecord = { ...payment, updatedAt: Date.now() };
  paymentsCache = [record, ...paymentsCache.filter((p) => p.id !== payment.id)];
  emitRegistryUpdate();
}

// ─── Écriture logs admin ──────────────────────────────────────────────────────

export async function appendAdminLogToCentralRegistry(
  log: Omit<RegistryAdminLogRecord, "createdAt" | "id"> & { id?: string }
): Promise<void> {
  await addAdminLog(log.adminWallet, log.action, log.targetId, log.details);

  const record: RegistryAdminLogRecord = {
    ...log,
    id: log.id ?? `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  adminLogsCache = [record, ...adminLogsCache];
  emitRegistryUpdate();
}

// ─── Sync prédiction → registry ───────────────────────────────────────────────

/**
 * Synchronise une entrée d'historique de prédiction avec le registry.
 * Avec Supabase, c'est un no-op : les données sont déjà dans la DB.
 * Conservé pour compatibilité avec les appels existants.
 */
export async function syncPredictionHistoryToCentralRegistry(
  _entry: PredictionHistoryEntry
): Promise<void> {
  // No-op : prediction_history est directement dans Supabase.
  // La synchronisation se fait automatiquement via les tables liées.
}

// ─── Souscription (compatible composants existants) ───────────────────────────

export function subscribeToCentralRegistry(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  if (!hasHydratedWallets) {
    void initCentralRegistry();
  }

  window.addEventListener(registryEventName, listener);
  return () => window.removeEventListener(registryEventName, listener);
}

// ─── Legacy compatibility ─────────────────────────────────────────────────────

/** @deprecated Utiliser readAllCentralWalletRecords() */
export function readCentralWallets(): RegistryWalletRecord[] {
  return readAllCentralWalletRecords();
}

/** @deprecated Utiliser readAllCentralPaymentRecords() */
export function readCentralPayments(): RegistryPaymentRecord[] {
  return readAllCentralPaymentRecords();
}

// ─── Aliases de compatibilité (noms anciens attendus par les composants) ───────

/**
 * @deprecated → initCentralRegistry()
 * Les arguments sont ignorés — Supabase gère les données.
 */
export async function hydrateCentralRegistry(_data?: unknown): Promise<void> {
  return initCentralRegistry();
}

/** @deprecated → readAllCentralWalletRecords() */
export const readCentralWalletRecords = readAllCentralWalletRecords;

/** @deprecated → readAllCentralPaymentRecords() */
export const readCentralPaymentRecords = readAllCentralPaymentRecords;

/** @deprecated → readAllCentralAdminLogRecords() */
export const readCentralAdminLogs = readAllCentralAdminLogRecords;

/** @deprecated → appendAdminLogToCentralRegistry() */
export const appendCentralAdminLog = appendAdminLogToCentralRegistry;

/** @deprecated → appendPaymentToCentralRegistry() */
export const syncPaymentRecordToCentralRegistry = appendPaymentToCentralRegistry;

/**
 * @deprecated — Enregistre un username + rôle pour le wallet.
 * Ancienne signature : (address, username, role)
 */
export async function registerCentralWalletIdentity(
  address: string,
  username: string,
  role: RegistryWalletRole = "user"
): Promise<RegistryWalletRecord | null> {
  await updateWalletProfile(address, { username });
  const row = await upsertWalletOnConnect(address);
  if (!row) return null;
  const record = walletRowToRegistry({ ...row, username, role });
  const idx = walletsCache.findIndex((w) => w.address === address);
  if (idx >= 0) {
    walletsCache[idx] = record;
  } else {
    walletsCache = [record, ...walletsCache];
  }
  emitRegistryUpdate();
  return record;
}

/**
 * @deprecated — Met à jour le profil social du wallet.
 * Ancienne signature : (address, { displayName, twitterHandle, role })
 */
export async function registerCentralWalletProfile(
  address: string,
  updates: {
    displayName?: string;
    twitterHandle?: string;
    role?: RegistryWalletRole;
    username?: string;
    avatarSrc?: string;
  }
): Promise<RegistryWalletRecord | null> {
  await updateWalletProfile(address, {
    displayName: updates.displayName,
    twitterHandle: updates.twitterHandle,
    username: updates.username,
    avatarSrc: updates.avatarSrc,
  });
  const row = await upsertWalletOnConnect(address);
  if (!row) return null;
  const record = walletRowToRegistry({
    ...row,
    role: updates.role ?? row.role,
    display_name: updates.displayName ?? row.display_name,
    twitter_handle: updates.twitterHandle ?? row.twitter_handle,
  });
  const idx = walletsCache.findIndex((w) => w.address === address);
  if (idx >= 0) {
    walletsCache[idx] = record;
  } else {
    walletsCache = [record, ...walletsCache];
  }
  emitRegistryUpdate();
  return record;
}

/** @deprecated → upsertWalletActivityToCentralRegistry() */
export const trackCentralWalletConnection = upsertWalletActivityToCentralRegistry;

/** @deprecated — Les bets sont dans prediction_history. Retourne cache vide. */
export function readCentralBetRecords(): RegistryBetRecord[] {
  return [];
}

/** @deprecated — L'historique est dans prediction_history. Retourne cache vide. */
export function readCentralHistoryRecords(): RegistryHistoryRecord[] {
  return [];
}

/** @deprecated — no-op */
export function clearCentralAdminControlData(): void {}

/** @deprecated — no-op */
export async function trackCentralWalletActivity(
  address: string,
  label?: string
): Promise<void> {
  await upsertWalletActivityToCentralRegistry(address, { latestActivityLabel: label });
}

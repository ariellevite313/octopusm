/**
 * octopus-admin.ts — MIGRÉ VERS SUPABASE
 *
 * Remplace : localStorage (octopus-market-admin-notifications-v2) + SSE + BroadcastChannel
 * Par : Supabase table payments + Realtime
 *
 * Types conservés. Cache mémoire populé par Supabase.
 */

import { syncPredictionEntriesForAdminDecision } from "@/components/octopus-market/prediction-market-store";
import {
  getAllPaymentsAdmin,
  getPendingPayments,
  createPaymentNotification,
  reviewPayment,
  subscribeToPayments,
} from "@/services/supabase/payment-service";
import { creditBetOcto, creditReferralCommission } from "@/services/supabase/octo-service";
import { upsertWalletActivityToCentralRegistry } from "@/components/octopus-market/octopus-central-registry";
import type { PaymentRow, BetToken } from "@/lib/supabase-types";

// ─── Types publics (inchangés) ────────────────────────────────────────────────

export type AdminPaymentFlow = "prediction" | "launch" | "listing";
export type AdminPaymentStatus = "pending" | "approved" | "rejected";

export type AdminPaymentNotification = {
  id: string;
  paymentRequestId: string;
  paymentReference: string;
  flow: AdminPaymentFlow;
  title: string;
  subtitle?: string;
  categoryLabel?: string;
  marketId?: string;
  selectionId?: string;
  selectionLabel?: string;
  username?: string;
  userWallet: string;
  recipientWallet: string;
  amountUsdc: number;
  reserveFeeUsdc: number;
  totalPaidUsdc: number;
  createdAt: number;
  status: AdminPaymentStatus;
  reviewedAt?: number;
  reviewedByWallet?: string;
  token?: BetToken;
};

export type ConnectedWalletSession = {
  address: string;
  firstSeenAt: number;
  lastSeenAt: number;
};

// ─── Cache mémoire ────────────────────────────────────────────────────────────

let adminNotificationsCache: AdminPaymentNotification[] = [];
let hasHydrated = false;
const adminStorageEventName = "octopus-market-admin-storage";
let realtimeUnsub: (() => void) | null = null;

function emitAdminStorageUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(adminStorageEventName));
  }
}

// ─── Conversion DB row ↔ app ──────────────────────────────────────────────────

function paymentRowToNotification(row: PaymentRow): AdminPaymentNotification {
  return {
    id: row.id,
    paymentRequestId: row.payment_request_id,
    paymentReference: row.payment_reference,
    flow: row.flow as AdminPaymentFlow,
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
    token: (row.token as BetToken) ?? "usdc",
    createdAt: new Date(row.created_at).getTime(),
    status: row.status as AdminPaymentStatus,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).getTime() : undefined,
    reviewedByWallet: row.reviewed_by_wallet ?? undefined,
  };
}

// ─── Initialisation ───────────────────────────────────────────────────────────

export async function initAdminNotifications(adminOnly = false): Promise<void> {
  const rows = adminOnly ? await getAllPaymentsAdmin() : await getPendingPayments();
  adminNotificationsCache = rows.map(paymentRowToNotification);
  hasHydrated = true;
  emitAdminStorageUpdate();

  // Realtime
  realtimeUnsub?.();
  const channel = subscribeToPayments((updatedRow) => {
    const idx = adminNotificationsCache.findIndex((n) => n.id === updatedRow.id);
    const existing = idx >= 0 ? adminNotificationsCache[idx] : undefined;
    const notification = paymentRowToNotification(updatedRow);
    // Preserve token from existing cache if the raw Realtime row doesn't have it
    // (migration not yet applied → updatedRow.token is null)
    const merged: AdminPaymentNotification = {
      ...notification,
      token: (updatedRow.token as BetToken | null | undefined) ?? existing?.token ?? "usdc",
    };
    if (idx >= 0) {
      adminNotificationsCache[idx] = merged;
    } else {
      adminNotificationsCache = [merged, ...adminNotificationsCache];
    }
    emitAdminStorageUpdate();
  });
  realtimeUnsub = () => { void channel.unsubscribe(); };
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

export function readAdminNotifications(): AdminPaymentNotification[] {
  if (!hasHydrated) {
    void initAdminNotifications();
  }
  return adminNotificationsCache;
}

export function readPendingAdminNotifications(): AdminPaymentNotification[] {
  return adminNotificationsCache.filter((n) => n.status === "pending");
}

export function readAdminNotificationByReference(
  reference: string
): AdminPaymentNotification | null {
  return adminNotificationsCache.find((n) => n.paymentReference === reference) ?? null;
}

// ─── Création ─────────────────────────────────────────────────────────────────

export async function appendAdminNotification(
  notification: AdminPaymentNotification
): Promise<AdminPaymentNotification[]> {
  if (adminNotificationsCache.some((n) => n.id === notification.id)) {
    return adminNotificationsCache;
  }

  const insertResult = await createPaymentNotification({
    id: notification.id,
    payment_request_id: notification.paymentRequestId,
    payment_reference: notification.paymentReference,
    flow: notification.flow,
    title: notification.title,
    subtitle: notification.subtitle ?? null,
    category_label: notification.categoryLabel ?? null,
    market_id: notification.marketId ?? null,
    selection_id: notification.selectionId ?? null,
    selection_label: notification.selectionLabel ?? null,
    username: notification.username ?? null,
    user_wallet: notification.userWallet,
    recipient_wallet: notification.recipientWallet,
    amount_usdc: notification.amountUsdc,
    reserve_fee_usdc: notification.reserveFeeUsdc,
    total_paid_usdc: notification.totalPaidUsdc,
    status: notification.status,
    reviewed_at: notification.reviewedAt
      ? new Date(notification.reviewedAt).toISOString()
      : null,
    reviewed_by_wallet: notification.reviewedByWallet ?? null,
    token: notification.token ?? "usdc",
  });
  if (!insertResult.success) {
    console.error("[octopus-admin] createPaymentNotification failed:", insertResult.error, { ref: notification.paymentReference });
  }

  adminNotificationsCache = [notification, ...adminNotificationsCache];
  emitAdminStorageUpdate();
  return adminNotificationsCache;
}

// ─── Admin : décision ─────────────────────────────────────────────────────────

export async function approveAdminNotification(
  notificationId: string,
  reviewerWallet: string
): Promise<{ success: boolean; error?: string }> {
  const result = await reviewPayment(notificationId, "approved", reviewerWallet);

  if (result.success) {
    const notification = adminNotificationsCache.find((n) => n.paymentReference === notificationId);

    adminNotificationsCache = adminNotificationsCache.map((n) =>
      n.paymentReference === notificationId
        ? { ...n, status: "approved" as const, reviewedAt: Date.now(), reviewedByWallet: reviewerWallet }
        : n
    );

    // Propager la décision aux entrées de prédiction
    if (notification?.flow === "prediction" && notification.paymentReference) {
      syncPredictionEntriesForAdminDecision(notification.paymentReference, "approved");
    }

    // Pour les paris CLT : créditer les OCTO rewards au moment de l'approbation admin
    // Formule : floor(cltStake / 25 000) OCTO
    if (
      notification?.flow === "prediction" &&
      notification.token === "clawdtrust" &&
      notification.amountUsdc > 0
    ) {
      void creditBetOcto(notification.userWallet, notification.amountUsdc, "clawdtrust");
    }

    // Pour les paris USDC : créditer les OCTO rewards au moment de l'approbation admin
    // Formule : floor(stake / 2) × 10 OCTO  (ex: 2 USDC → 10 OCTO, 10 USDC → 50 OCTO)
    if (
      notification?.flow === "prediction" &&
      notification.token === "usdc" &&
      notification.amountUsdc > 0
    ) {
      void creditBetOcto(notification.userWallet, notification.amountUsdc, "usdc");
    }

    // Créditer 5% des frais de réserve au parrain (dans le token du pari)
    if (notification?.flow === "prediction" && notification.reserveFeeUsdc > 0) {
      void creditReferralCommission(
        notification.userWallet,
        "bet_fee",
        notification.reserveFeeUsdc,
        notification.paymentReference,
        notification.token ?? "usdc"
      );
    }

    emitAdminStorageUpdate();
  }

  return result;
}

export async function rejectAdminNotification(
  notificationId: string,
  reviewerWallet: string
): Promise<{ success: boolean; error?: string }> {
  const result = await reviewPayment(notificationId, "rejected", reviewerWallet);

  if (result.success) {
    const notification = adminNotificationsCache.find((n) => n.paymentReference === notificationId);

    adminNotificationsCache = adminNotificationsCache.map((n) =>
      n.paymentReference === notificationId
        ? { ...n, status: "rejected" as const, reviewedAt: Date.now(), reviewedByWallet: reviewerWallet }
        : n
    );

    if (notification?.flow === "prediction" && notification.paymentReference) {
      syncPredictionEntriesForAdminDecision(notification.paymentReference, "rejected");
    }

    emitAdminStorageUpdate();
  }

  return result;
}

// ─── Tracking wallet (remplace ConnectedWalletSession localStorage) ────────────

export async function trackConnectedWallet(
  address: string,
  options: { isAdminWallet?: boolean; activityLabel?: string } = {}
): Promise<void> {
  await upsertWalletActivityToCentralRegistry(address, {
    role: options.isAdminWallet ? "admin" : "user",
    latestActivityLabel: options.activityLabel ?? "Connected to Octopus Market",
  });
}

// ─── Souscription (compatible composants existants) ───────────────────────────

export function subscribeToAdminNotifications(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  if (!hasHydrated) {
    void initAdminNotifications();
  }

  window.addEventListener(adminStorageEventName, listener);
  return () => window.removeEventListener(adminStorageEventName, listener);
}

// ─── Legacy stubs (pour éviter les erreurs de compilation) ───────────────────

/** @deprecated — plus de SSE custom */
export function stopAdminNotificationsSync(): void {}

/** @deprecated — Supabase Realtime remplace le polling */
export function startAdminNotificationsSync(): void {
  if (!hasHydrated) void initAdminNotifications();
}

// ─── Aliases de compatibilité (noms anciens attendus par les composants) ───────

/** @deprecated → readAdminNotifications() */
export const readAdminPaymentNotifications = readAdminNotifications;

/** @deprecated → readPendingAdminNotifications() */
export const readPendingPaymentNotifications = readPendingAdminNotifications;

/** @deprecated → appendAdminNotification() */
export const upsertAdminPaymentNotification = appendAdminNotification;

/**
 * Construit une AdminPaymentNotification depuis un PaymentRequest validé
 * et la persiste en arrière-plan dans Supabase.
 * Retourne la notification de façon synchrone pour compatibilité.
 */
export function notifyAdminForValidatedPayment(
  paymentRequest: {
    id: string;
    reference: string;
    recipient: string;
    amount: number;
    walletAddress: string;
    kind?: string;
    label?: string;
    message?: string;
    memo?: string;
    metadata?: Record<string, string | number | boolean>;
  } | AdminPaymentNotification
): AdminPaymentNotification {
  // Si c'est déjà une AdminPaymentNotification
  if ("flow" in paymentRequest && "userWallet" in paymentRequest) {
    void appendAdminNotification(paymentRequest as AdminPaymentNotification);
    return paymentRequest as AdminPaymentNotification;
  }

  // Construire depuis PaymentRequest
  const pr = paymentRequest as {
    id: string; reference: string; recipient: string; amount: number;
    walletAddress: string; kind?: string; label?: string; message?: string; memo?: string;
    metadata?: Record<string, string | number | boolean>;
  };
  const meta = pr.metadata ?? {};
  const notification: AdminPaymentNotification = {
    id: `admin-${pr.reference}`,
    paymentRequestId: pr.id,
    paymentReference: pr.reference,
    flow: (pr.kind ?? "prediction") as AdminPaymentFlow,
    title: String(meta.marketTitle ?? pr.message ?? pr.label ?? "Prediction Payment"),
    subtitle: pr.memo ?? undefined,
    categoryLabel: meta.categoryLabel ? String(meta.categoryLabel) : undefined,
    marketId: meta.marketId ? String(meta.marketId) : undefined,
    selectionId: meta.selectionId ? String(meta.selectionId) : undefined,
    selectionLabel: meta.selectionLabel ? String(meta.selectionLabel) : undefined,
    userWallet: pr.walletAddress,
    recipientWallet: pr.recipient,
    amountUsdc: Number(meta.stake ?? pr.amount),
    reserveFeeUsdc: Number(meta.reserveFee ?? 0),
    totalPaidUsdc: meta.token === "clawdtrust"
      ? Number(meta.totalChargeClt ?? meta.stake ?? pr.amount)
      : Number(meta.totalChargeUsdc ?? pr.amount),
    createdAt: Date.now(),
    status: "pending",
    token: (typeof meta.token === "string" ? meta.token : "usdc") as BetToken,
  };
  void appendAdminNotification(notification);
  return notification;
}

/** @deprecated → subscribeToAdminNotifications() */
export const subscribeToAdminStorage = subscribeToAdminNotifications;

/** @deprecated → trackConnectedWallet() */
export const trackConnectedWalletSession = trackConnectedWallet;

/**
 * @deprecated — Approve ou Reject selon le statut.
 * Remplacé par approveAdminNotification() / rejectAdminNotification()
 */
export async function updateAdminPaymentNotificationStatus(
  notificationId: string,
  status: "approved" | "rejected",
  reviewerWallet: string
): Promise<{ success: boolean; error?: string }> {
  if (status === "approved") {
    return approveAdminNotification(notificationId, reviewerWallet);
  }
  return rejectAdminNotification(notificationId, reviewerWallet);
}

/** @deprecated — no-op, les sessions wallet sont dans Supabase */
export function readConnectedWalletSessions(): ConnectedWalletSession[] {
  return [];
}

/** @deprecated — no-op, Supabase Realtime remplace le polling depuis le treasury */
export async function syncAdminNotificationsFromTreasury(_walletAddress?: string): Promise<void> {}

/** @deprecated — no-op, Supabase persiste automatiquement */
export async function persistAdminNotificationsStateToServer(): Promise<void> {}


/** @deprecated — no-op */
export async function clearAdminControlHistory(): Promise<void> {}

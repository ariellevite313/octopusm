/**
 * Payment Service — remplace octopus-admin.ts (notifications)
 * CRUD sur la table `payments` (notifications de paiement admin)
 *
 * Les mutations admin (reviewPayment) passent par une Edge Function
 * qui vérifie le wallet admin côté serveur et utilise service_role.
 */

import { supabase } from "../../lib/supabase";
import { callAdminFunction } from "../../lib/supabase-admin";
import type { PaymentRow, PaymentStatus } from "../../lib/supabase-types";

// ─── Lecture ──────────────────────────────────────────────────────────────────

export async function getPaymentsByWallet(
  walletAddress: string
): Promise<PaymentRow[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("user_wallet", walletAddress)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[payment-service] getPaymentsByWallet:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getAllPaymentsAdmin(): Promise<PaymentRow[] | null> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[payment-service] getAllPaymentsAdmin:", error.message);
    return null; // null = erreur Supabase, distingué de [] (aucun paiement)
  }
  return data ?? [];
}

export async function getPendingPayments(): Promise<PaymentRow[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[payment-service] getPendingPayments:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getPaymentByReference(
  reference: string
): Promise<PaymentRow | null> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("payment_reference", reference)
    .maybeSingle();

  if (error) {
    console.error("[payment-service] getPaymentByReference:", error.message);
    return null;
  }
  return data;
}

// ─── Création ─────────────────────────────────────────────────────────────────

export async function createPaymentNotification(
  payment: Omit<PaymentRow, "created_at" | "updated_at">
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from("payments").insert(payment);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── Admin : décision ─────────────────────────────────────────────────────────

/**
 * Approuve ou rejette un paiement.
 * Route vers l'Edge Function admin-review-payment qui vérifie le wallet
 * côté serveur et utilise service_role pour contourner les RLS restreintes.
 */
export async function reviewPayment(
  paymentReference: string,
  status: PaymentStatus,
  reviewerWallet: string
): Promise<{ success: boolean; error?: string }> {
  if (status === "pending") {
    return { success: false, error: "Statut invalide pour une révision." };
  }

  return callAdminFunction("admin-review-payment", {
    paymentReference,
    status,
    reviewerWallet,
  }, reviewerWallet);
}

// ─── Realtime ─────────────────────────────────────────────────────────────────

export function subscribeToPayments(
  onUpdate: (payment: PaymentRow) => void,
  filterWallet?: string
) {
  const filter = filterWallet
    ? `user_wallet=eq.${filterWallet}`
    : undefined;

  return supabase
    .channel("payments-changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "payments",
        ...(filter ? { filter } : {}),
      },
      (payload) => {
        if (payload.new) onUpdate(payload.new as PaymentRow);
      }
    )
    .subscribe();
}

/**
 * octo-service.ts
 *
 * Appels aux Edge Functions OCTO (parrainage + gains sur paris).
 * Toutes les mutations passent par service_role via Edge Functions.
 * Les lectures utilisent supabase anon (RLS permissive en SELECT).
 */

import { supabase } from "../../lib/supabase";
import type { OctoTransactionRow, ReferralCommissionRow, ReferralCommissionClaimRow, ReferralRow } from "../../lib/supabase-types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function callOctoFunction<T = unknown>(
  functionName: string,
  body: Record<string, unknown>
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { success?: boolean; error?: string } & T;
    if (!res.ok || json.error) {
      return { success: false, error: json.error ?? `Erreur serveur (${res.status})` };
    }
    return { success: true, data: json };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur réseau";
    console.error(`[octo-service] ${functionName}:`, msg);
    return { success: false, error: msg };
  }
}

// ─── Referral code ────────────────────────────────────────────────────────────

export async function getOrCreateReferralCode(
  walletAddress: string
): Promise<string | null> {
  const res = await callOctoFunction<{ code: string }>(
    "get-or-create-referral-code",
    { wallet_address: walletAddress }
  );
  return res.data?.code ?? null;
}

// ─── Register referral ────────────────────────────────────────────────────────

export async function registerReferral(
  referredWallet: string,
  referralCode: string
): Promise<{ success: boolean; already_registered?: boolean; error?: string }> {
  const res = await callOctoFunction<{ already_registered?: boolean }>(
    "register-referral",
    { referred_wallet: referredWallet, referral_code: referralCode }
  );
  return {
    success: res.success,
    already_registered: res.data?.already_registered,
    error: res.error,
  };
}

// ─── Credit bet OCTO ─────────────────────────────────────────────────────────

export async function creditBetOcto(
  walletAddress: string,
  amountUsd: number
): Promise<{ octo_credited: number }> {
  const res = await callOctoFunction<{ octo_credited: number }>(
    "credit-bet-octo",
    { wallet_address: walletAddress, amount_usd: amountUsd }
  );
  return { octo_credited: res.data?.octo_credited ?? 0 };
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/** Solde total OCTO d'un wallet */
export async function getOctoBalance(walletAddress: string): Promise<number> {
  const { data, error } = await supabase
    .from("octo_transactions")
    .select("amount")
    .eq("wallet_address", walletAddress);

  if (error || !data) return 0;
  return data.reduce((sum, row) => sum + (row.amount as number), 0);
}

/** Gains OCTO par type (pour décomposer dans le dashboard) */
export async function getOctoBreakdown(walletAddress: string): Promise<{
  referral: number;
  bet: number;
  total: number;
}> {
  const { data, error } = await supabase
    .from("octo_transactions")
    .select("type, amount")
    .eq("wallet_address", walletAddress);

  if (error || !data) return { referral: 0, bet: 0, total: 0 };

  const rows = data as Pick<OctoTransactionRow, "type" | "amount">[];
  const referral = rows.filter((r) => r.type === "referral").reduce((s, r) => s + r.amount, 0);
  const bet = rows.filter((r) => r.type === "bet").reduce((s, r) => s + r.amount, 0);
  return { referral, bet, total: referral + bet };
}

/** Liste des filleuls du parrain avec date */
export async function getReferrals(
  referrerWallet: string
): Promise<ReferralRow[]> {
  const { data, error } = await supabase
    .from("referrals")
    .select("*")
    .eq("referrer_wallet", referrerWallet)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as ReferralRow[];
}

/** Username d'un wallet (depuis la table wallets) — pour afficher dans le tableau */
export async function getWalletUsername(walletAddress: string): Promise<string | null> {
  const { data } = await supabase
    .from("wallets")
    .select("username")
    .eq("address", walletAddress)
    .single();
  return (data as { username: string | null } | null)?.username ?? null;
}

// ─── Referral Commission (USDC) ───────────────────────────────────────────────

export async function creditReferralCommission(
  referredWallet: string,
  type: "bet_fee" | "loss_commission",
  amountUsdc: number,
  betReference: string
): Promise<{ success: boolean; commission_usdc?: number; skipped?: boolean }> {
  const res = await callOctoFunction<{ commission_usdc?: number; skipped?: boolean }>(
    "credit-referral-commission",
    { referred_wallet: referredWallet, type, amount_usdc: amountUsdc, bet_reference: betReference }
  );
  return {
    success: res.success,
    commission_usdc: res.data?.commission_usdc,
    skipped: res.data?.skipped,
  };
}

export async function claimReferralCommissions(
  referrerWallet: string
): Promise<{ success: boolean; claim_id?: string; total_usdc?: number; already_pending?: boolean; error?: string }> {
  const res = await callOctoFunction<{
    claim_id?: string;
    total_usdc?: number;
    already_pending?: boolean;
  }>("claim-referral-commissions", { referrer_wallet: referrerWallet });
  return {
    success: res.success,
    claim_id: res.data?.claim_id,
    total_usdc: res.data?.total_usdc,
    already_pending: res.data?.already_pending,
    error: res.error,
  };
}

export async function markCommissionClaimPaid(
  claimId: string,
  adminWallet: string
): Promise<{ success: boolean; error?: string }> {
  const res = await callOctoFunction<Record<string, never>>(
    "mark-commission-claim-paid",
    { claim_id: claimId, admin_wallet: adminWallet }
  );
  return { success: res.success, error: res.error };
}

/** Solde USDC disponible (total gagné - total payé via claims paid) */
export async function getReferralCommissionBalance(
  referrerWallet: string
): Promise<{ available: number; total_earned: number; pending_claim: number }> {
  const [commissionsRes, claimsRes] = await Promise.all([
    supabase
      .from("referral_commissions")
      .select("amount_usdc")
      .eq("referrer_wallet", referrerWallet),
    supabase
      .from("referral_commission_claims")
      .select("total_usdc, status")
      .eq("referrer_wallet", referrerWallet),
  ]);

  if (commissionsRes.error) {
    console.error("[octo-service] referral_commissions SELECT error:", commissionsRes.error.message, commissionsRes.error.code, { referrerWallet });
  }
  if (claimsRes.error) {
    console.error("[octo-service] referral_commission_claims SELECT error:", claimsRes.error.message, claimsRes.error.code, { referrerWallet });
  }
  console.log("[octo-service] commissions data:", commissionsRes.data, "claims data:", claimsRes.data);

  const totalEarned = (commissionsRes.data ?? []).reduce(
    (sum, row) => sum + Number((row as ReferralCommissionRow).amount_usdc),
    0
  );

  const rows = (claimsRes.data ?? []) as Pick<ReferralCommissionClaimRow, "total_usdc" | "status">[];
  const totalPaid = rows.filter((r) => r.status === "paid").reduce((sum, r) => sum + Number(r.total_usdc), 0);
  const pendingClaim = rows.filter((r) => r.status === "pending").reduce((sum, r) => sum + Number(r.total_usdc), 0);

  return {
    total_earned: Math.round(totalEarned * 10000) / 10000,
    available: Math.round((totalEarned - totalPaid - pendingClaim) * 10000) / 10000,
    pending_claim: Math.round(pendingClaim * 10000) / 10000,
  };
}

/** Commissions par filleul (pour colonne USDC dans le tableau) */
export async function getReferralCommissionsByReferred(
  referrerWallet: string
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("referral_commissions")
    .select("referred_wallet, amount_usdc")
    .eq("referrer_wallet", referrerWallet);

  const map: Record<string, number> = {};
  for (const row of (data ?? []) as Pick<ReferralCommissionRow, "referred_wallet" | "amount_usdc">[]) {
    map[row.referred_wallet] = (map[row.referred_wallet] ?? 0) + Number(row.amount_usdc);
  }
  return map;
}

/** Liste de tous les claims (pour l admin) */
export async function getAllCommissionClaims(): Promise<ReferralCommissionClaimRow[]> {
  const { data } = await supabase
    .from("referral_commission_claims")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as ReferralCommissionClaimRow[];
}

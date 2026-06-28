/**
 * octo-service.ts
 *
 * Appels aux Edge Functions OCTO (parrainage + gains sur paris).
 * Toutes les mutations passent par service_role via Edge Functions.
 * Les lectures utilisent supabase anon (RLS permissive en SELECT).
 */

import { supabase } from "../../lib/supabase";
import type { OctoTransactionRow, ReferralCommissionRow, ReferralCommissionClaimRow, ReferralRow, BetToken } from "../../lib/supabase-types";

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
  amount: number,
  token: BetToken = "usdc"
): Promise<{ octo_credited: number }> {
  const body: Record<string, unknown> = {
    wallet_address: walletAddress,
    token,
  };
  if (token === "clawdtrust") {
    body.amount_clt = amount;
  } else {
    body.amount_usd = amount;
  }
  const res = await callOctoFunction<{ octo_credited: number }>("credit-bet-octo", body);
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

// ─── Referral Commission (USDC + CLT) ──────────────────────────────────────────

export async function creditReferralCommission(
  referredWallet: string,
  type: "bet_fee" | "loss_commission",
  amount: number,
  betReference: string,
  token: BetToken = "usdc"
): Promise<{ success: boolean; commission_usdc?: number; commission_clt?: number; skipped?: boolean }> {
  const body: Record<string, unknown> = {
    referred_wallet: referredWallet,
    type,
    token,
    bet_reference: betReference,
  };
  if (token === "clawdtrust") {
    body.amount_clt = amount;
  } else {
    body.amount_usdc = amount;
  }
  const res = await callOctoFunction<{ commission_usdc?: number; commission_clt?: number; skipped?: boolean }>(
    "credit-referral-commission",
    body
  );
  return {
    success: res.success,
    commission_usdc: res.data?.commission_usdc,
    commission_clt: res.data?.commission_clt,
    skipped: res.data?.skipped,
  };
}

export async function claimReferralCommissions(
  referrerWallet: string
): Promise<{ success: boolean; claim_id?: string; total_usdc?: number; total_clt?: number; already_pending?: boolean; error?: string }> {
  const res = await callOctoFunction<{
    claim_id?: string;
    total_usdc?: number;
    total_clt?: number;
    already_pending?: boolean;
  }>("claim-referral-commissions", { referrer_wallet: referrerWallet });
  return {
    success: res.success,
    claim_id: res.data?.claim_id,
    total_usdc: res.data?.total_usdc,
    total_clt: res.data?.total_clt,
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
): Promise<{
  available: number; total_earned: number; pending_claim: number;
  available_clt: number; total_earned_clt: number; pending_claim_clt: number;
}> {
  const [commissionsRes, claimsRes] = await Promise.all([
    supabase
      .from("referral_commissions")
      .select("amount_usdc, amount_clt")
      .eq("referrer_wallet", referrerWallet),
    supabase
      .from("referral_commission_claims")
      .select("total_usdc, total_clt, status")
      .eq("referrer_wallet", referrerWallet),
  ]);

  if (commissionsRes.error) {
    console.error("[octo-service] referral_commissions SELECT error:", commissionsRes.error.message, commissionsRes.error.code, { referrerWallet });
  }
  if (claimsRes.error) {
    console.error("[octo-service] referral_commission_claims SELECT error:", claimsRes.error.message, claimsRes.error.code, { referrerWallet });
  }

  const totalEarned = (commissionsRes.data ?? []).reduce(
    (sum, row) => sum + Number((row as ReferralCommissionRow).amount_usdc ?? 0),
    0
  );
  const totalEarnedClt = (commissionsRes.data ?? []).reduce(
    (sum, row) => sum + Number((row as ReferralCommissionRow).amount_clt ?? 0),
    0
  );

  const rows = (claimsRes.data ?? []) as Pick<ReferralCommissionClaimRow, "total_usdc" | "total_clt" | "status">[];
  const totalPaid = rows.filter((r) => r.status === "paid").reduce((sum, r) => sum + Number(r.total_usdc ?? 0), 0);
  const pendingClaim = rows.filter((r) => r.status === "pending").reduce((sum, r) => sum + Number(r.total_usdc ?? 0), 0);
  const totalPaidClt = rows.filter((r) => r.status === "paid").reduce((sum, r) => sum + Number(r.total_clt ?? 0), 0);
  const pendingClaimClt = rows.filter((r) => r.status === "pending").reduce((sum, r) => sum + Number(r.total_clt ?? 0), 0);

  return {
    total_earned: Math.round(totalEarned * 10000) / 10000,
    available: Math.round((totalEarned - totalPaid - pendingClaim) * 10000) / 10000,
    pending_claim: Math.round(pendingClaim * 10000) / 10000,
    total_earned_clt: Math.round(totalEarnedClt * 100) / 100,
    available_clt: Math.round((totalEarnedClt - totalPaidClt - pendingClaimClt) * 100) / 100,
    pending_claim_clt: Math.round(pendingClaimClt * 100) / 100,
  };
}

/** Commissions par filleul (pour colonne USDC dans le tableau) */
export async function getReferralCommissionsByReferred(
  referrerWallet: string
): Promise<Record<string, { usdc: number; clt: number }>> {
  const { data } = await supabase
    .from("referral_commissions")
    .select("referred_wallet, amount_usdc, amount_clt")
    .eq("referrer_wallet", referrerWallet);

  const map: Record<string, { usdc: number; clt: number }> = {};
  for (const row of (data ?? []) as Pick<ReferralCommissionRow, "referred_wallet" | "amount_usdc" | "amount_clt">[]) {
    const prev = map[row.referred_wallet] ?? { usdc: 0, clt: 0 };
    map[row.referred_wallet] = {
      usdc: prev.usdc + Number(row.amount_usdc ?? 0),
      clt: prev.clt + Number(row.amount_clt ?? 0),
    };
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

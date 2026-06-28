/**
 * claim-referral-commissions
 *
 * Le parrain demande le paiement de son solde disponible (USDC + CLT).
 *
 * Body: { referrer_wallet: string }
 * Returns: { success, claim_id, total_usdc, total_clt }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { referrer_wallet } = await req.json() as { referrer_wallet: string };

    if (!referrer_wallet) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing referrer_wallet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Vérifier qu'il n'y a pas déjà un claim pending
    const { data: pendingClaim } = await supabase
      .from("referral_commission_claims")
      .select("id, total_usdc, total_clt")
      .eq("referrer_wallet", referrer_wallet)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingClaim) {
      return new Response(
        JSON.stringify({
          success: false,
          already_pending: true,
          error: "A claim is already pending payment",
          pending_claim_id: pendingClaim.id,
          pending_usdc: pendingClaim.total_usdc,
          pending_clt: pendingClaim.total_clt,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Totaux déjà payés (paid claims)
    const { data: paidClaims } = await supabase
      .from("referral_commission_claims")
      .select("total_usdc, total_clt")
      .eq("referrer_wallet", referrer_wallet)
      .eq("status", "paid");

    const totalPaidUsdc = (paidClaims ?? []).reduce(
      (sum: number, row: { total_usdc: number }) => sum + Number(row.total_usdc), 0
    );
    const totalPaidClt = (paidClaims ?? []).reduce(
      (sum: number, row: { total_clt: number }) => sum + Number(row.total_clt ?? 0), 0
    );

    // Total de toutes les commissions gagnées
    const { data: allCommissions } = await supabase
      .from("referral_commissions")
      .select("amount_usdc, amount_clt")
      .eq("referrer_wallet", referrer_wallet);

    const totalEarnedUsdc = (allCommissions ?? []).reduce(
      (sum: number, row: { amount_usdc: number | null }) => sum + Number(row.amount_usdc ?? 0), 0
    );
    const totalEarnedClt = (allCommissions ?? []).reduce(
      (sum: number, row: { amount_clt: number | null }) => sum + Number(row.amount_clt ?? 0), 0
    );

    const availableUsdc = Math.round((totalEarnedUsdc - totalPaidUsdc) * 10000) / 10000;
    const availableClt  = Math.round((totalEarnedClt  - totalPaidClt)  * 10000) / 10000;

    if (availableUsdc <= 0 && availableClt <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No available balance to claim" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Créer la réclamation
    const { data: claim, error: insertError } = await supabase
      .from("referral_commission_claims")
      .insert({
        referrer_wallet,
        total_usdc: Math.max(0, availableUsdc),
        total_clt:  Math.max(0, availableClt),
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !claim) {
      return new Response(
        JSON.stringify({ success: false, error: insertError?.message ?? "Insert failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        claim_id: claim.id,
        total_usdc: Math.max(0, availableUsdc),
        total_clt:  Math.max(0, availableClt),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

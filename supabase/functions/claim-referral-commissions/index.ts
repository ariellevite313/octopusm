/**
 * claim-referral-commissions
 *
 * Le parrain demande le paiement de son solde USDC disponible.
 * "Disponible" = total des commissions NON couvertes par un claim pending ou paid.
 *
 * Body: { referrer_wallet: string }
 *
 * Returns: { success, claim_id, total_usdc } | { success: false, error, already_pending? }
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
      .select("id, total_usdc")
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
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculer le total des commissions déjà payées (paid claims)
    const { data: paidClaims } = await supabase
      .from("referral_commission_claims")
      .select("total_usdc")
      .eq("referrer_wallet", referrer_wallet)
      .eq("status", "paid");

    const totalPaid = (paidClaims ?? []).reduce(
      (sum: number, row: { total_usdc: number }) => sum + Number(row.total_usdc),
      0
    );

    // Calculer le total de toutes les commissions gagnées
    const { data: allCommissions } = await supabase
      .from("referral_commissions")
      .select("amount_usdc")
      .eq("referrer_wallet", referrer_wallet);

    const totalEarned = (allCommissions ?? []).reduce(
      (sum: number, row: { amount_usdc: number }) => sum + Number(row.amount_usdc),
      0
    );

    const availableUsdc = Math.round((totalEarned - totalPaid) * 10000) / 10000;

    if (availableUsdc <= 0) {
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
        total_usdc: availableUsdc,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !claim) {
      console.error("[claim-referral-commissions] insert:", insertError?.message);
      return new Response(
        JSON.stringify({ success: false, error: insertError?.message ?? "Insert failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, claim_id: claim.id, total_usdc: availableUsdc }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[claim-referral-commissions] unexpected:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

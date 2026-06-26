/**
 * credit-referral-commission
 *
 * Crédite 5% des frais (bet_fee) ou 5% de la mise perdue (loss_commission)
 * au parrain du wallet référencé.
 *
 * Body: {
 *   referred_wallet : string   — wallet du filleul
 *   type            : "bet_fee" | "loss_commission"
 *   amount_usdc     : number   — montant BRUT (frais ou mise) ; on calcule 5% ici
 *   bet_reference   : string   — payment_reference du pari
 * }
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
    const { referred_wallet, type, amount_usdc, bet_reference } = await req.json() as {
      referred_wallet: string;
      type: "bet_fee" | "loss_commission";
      amount_usdc: number;
      bet_reference: string;
    };

    if (!referred_wallet || !type || !amount_usdc || !bet_reference) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["bet_fee", "loss_commission"].includes(type)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const commission = Math.round(amount_usdc * 0.05 * 10000) / 10000; // 5%, arrondi 4 décimales

    if (commission <= 0) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "commission_zero" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Trouver le parrain
    const { data: referralRow, error: refError } = await supabase
      .from("referrals")
      .select("referrer_wallet")
      .eq("referred_wallet", referred_wallet)
      .maybeSingle();

    if (refError) {
      console.error("[credit-referral-commission] referral lookup:", refError.message);
      return new Response(
        JSON.stringify({ success: false, error: refError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!referralRow) {
      // Pas de parrain → rien à créditer
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_referrer" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Éviter les doublons sur (bet_reference, type)
    const { data: existing } = await supabase
      .from("referral_commissions")
      .select("id")
      .eq("bet_reference", bet_reference)
      .eq("type", type)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "already_credited" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insérer la commission
    const { error: insertError } = await supabase
      .from("referral_commissions")
      .insert({
        referrer_wallet: referralRow.referrer_wallet,
        referred_wallet,
        type,
        amount_usdc: commission,
        bet_reference,
      });

    if (insertError) {
      console.error("[credit-referral-commission] insert:", insertError.message);
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        referrer_wallet: referralRow.referrer_wallet,
        commission_usdc: commission,
        type,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[credit-referral-commission] unexpected:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

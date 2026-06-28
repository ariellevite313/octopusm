/**
 * credit-referral-commission
 *
 * Crédite 5% des frais (bet_fee) ou 5% de la mise perdue (loss_commission)
 * au parrain du wallet référencé.
 *
 * Supporte USDC et ClawdTrust (CLT).
 *
 * Body: {
 *   referred_wallet : string
 *   type            : "bet_fee" | "loss_commission"
 *   token           : "usdc" | "clawdtrust"
 *   amount_usdc?    : number   — montant BRUT en USDC (si token = usdc)
 *   amount_clt?     : number   — montant BRUT en CLT  (si token = clawdtrust)
 *   bet_reference   : string
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
    const { referred_wallet, type, token, amount_usdc, amount_clt, bet_reference } =
      await req.json() as {
        referred_wallet: string;
        type: "bet_fee" | "loss_commission";
        token?: string;
        amount_usdc?: number;
        amount_clt?: number;
        bet_reference: string;
      };

    const resolvedToken = token ?? "usdc";

    if (!referred_wallet || !type || !bet_reference) {
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

    // ── Calcul de la commission selon le token ────────────────────────────────
    let commission_usdc: number | null = null;
    let commission_clt: number | null = null;

    if (resolvedToken === "clawdtrust") {
      if (!amount_clt || amount_clt <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: "amount_clt requis pour clawdtrust" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      commission_clt = Math.round(amount_clt * 0.05 * 10000) / 10000; // 5%, 4 décimales
    } else {
      if (!amount_usdc || amount_usdc <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: "amount_usdc requis pour usdc" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      commission_usdc = Math.round(amount_usdc * 0.05 * 10000) / 10000;
    }

    const effectiveCommission = commission_usdc ?? commission_clt ?? 0;
    if (effectiveCommission <= 0) {
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
      return new Response(
        JSON.stringify({ success: false, error: refError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!referralRow) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_referrer" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Éviter les doublons sur (bet_reference, type, token)
    const { data: existing } = await supabase
      .from("referral_commissions")
      .select("id")
      .eq("bet_reference", bet_reference)
      .eq("type", type)
      .eq("token", resolvedToken)
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
        token: resolvedToken,
        amount_usdc: commission_usdc,
        amount_clt: commission_clt,
        bet_reference,
      });

    if (insertError) {
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        referrer_wallet: referralRow.referrer_wallet,
        token: resolvedToken,
        commission_usdc,
        commission_clt,
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

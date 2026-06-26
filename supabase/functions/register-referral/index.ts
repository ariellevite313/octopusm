/**
 * Edge Function : register-referral
 *
 * Enregistre une affiliation et crédite +10 OCTO au parrain.
 * Body attendu : { referred_wallet: string, referral_code: string }
 *
 * Règles :
 *  - Le code doit exister dans referral_codes
 *  - referred_wallet ne doit pas déjà être dans referrals (UNIQUE)
 *  - referred_wallet ≠ referrer_wallet (anti-auto-parrainage)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { referred_wallet, referral_code } = await req.json() as {
      referred_wallet?: string;
      referral_code?: string;
    };

    if (!referred_wallet || !referral_code) {
      return new Response(
        JSON.stringify({ error: "referred_wallet et referral_code requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Résoudre le code → referrer_wallet
    const { data: codeRow } = await supabase
      .from("referral_codes")
      .select("wallet_address")
      .eq("code", referral_code)
      .single();

    if (!codeRow) {
      return new Response(
        JSON.stringify({ error: "Code de parrainage invalide" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const referrer_wallet = codeRow.wallet_address as string;

    // 2. Anti-auto-parrainage
    if (referrer_wallet === referred_wallet) {
      return new Response(
        JSON.stringify({ error: "Auto-parrainage non autorisé" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Vérifier que ce wallet n'a pas déjà été référencé
    const { data: existing } = await supabase
      .from("referrals")
      .select("id")
      .eq("referred_wallet", referred_wallet)
      .single();

    if (existing) {
      // Déjà référencé — pas d'erreur, on ignore silencieusement
      return new Response(
        JSON.stringify({ success: true, already_registered: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Enregistrer l'affiliation
    const { error: refError } = await supabase
      .from("referrals")
      .insert({ referrer_wallet, referred_wallet });

    if (refError) {
      // UNIQUE violation = race condition, déjà référencé
      if (refError.code === "23505") {
        return new Response(
          JSON.stringify({ success: true, already_registered: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: refError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Créditer +10 OCTO au parrain ET +5 OCTO au filleul
    const { error: txError } = await supabase
      .from("octo_transactions")
      .insert([
        {
          wallet_address: referrer_wallet,
          type: "referral",
          amount: 10,
          ref_wallet: referred_wallet,
        },
        {
          wallet_address: referred_wallet,
          type: "referral",
          amount: 5,
          ref_wallet: referrer_wallet,
        },
      ]);

    if (txError) {
      console.error("[register-referral] credit OCTO error:", txError.message);
      // L'affiliation est enregistrée, on log l'erreur mais on ne fait pas échouer
    }

    return new Response(
      JSON.stringify({ success: true, referrer_wallet, octo_credited: 10, referred_octo_credited: 5 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

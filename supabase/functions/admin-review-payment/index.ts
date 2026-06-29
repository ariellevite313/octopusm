/**
 * Edge Function : admin-review-payment
 *
 * Approuve ou rejette un paiement.
 * Vérifie que le caller est l'admin wallet côté serveur (ADMIN_WALLET_ADDRESS env var).
 * Utilise service_role pour contourner RLS.
 *
 * Body attendu :
 *   { paymentReference: string, status: "approved" | "rejected", reviewerWallet: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-wallet",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Vérification admin ─────────────────────────────────────────────────────
    const adminWallet = Deno.env.get("ADMIN_WALLET_ADDRESS");
    const callerWallet = req.headers.get("x-admin-wallet");

    if (!adminWallet || !callerWallet || callerWallet !== adminWallet) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: admin wallet required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Client service_role (contourne RLS) ────────────────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ── Body ───────────────────────────────────────────────────────────────────
    const { paymentReference, status, reviewerWallet } = await req.json() as {
      paymentReference: string;
      status: "approved" | "rejected";
      reviewerWallet: string;
    };

    if (!paymentReference || !status || !reviewerWallet) {
      return new Response(
        JSON.stringify({ error: "paymentReference, status et reviewerWallet sont requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (status === "pending") {
      return new Response(
        JSON.stringify({ error: "Statut invalide pour une révision" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Mise à jour du paiement ────────────────────────────────────────────────
    const { error: paymentError } = await supabase
      .from("payments")
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by_wallet: reviewerWallet,
      })
      .eq("payment_reference", paymentReference);

    if (paymentError) {
      return new Response(
        JSON.stringify({ error: paymentError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Mettre à jour prediction_history (approuvé ET rejeté) ─────────────────
    const { data: payment } = await supabase
      .from("payments")
      .select("flow, market_id")
      .eq("payment_reference", paymentReference)
      .maybeSingle();

    if (payment?.flow === "prediction" && payment?.market_id) {
      await supabase
        .from("prediction_history")
        .update({ admin_decision_status: status })
        .eq("payment_reference", paymentReference);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

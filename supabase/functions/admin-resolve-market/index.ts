/**
 * Edge Function : admin-resolve-market
 *
 * Résout un marché et met à jour tous les paris liés.
 * Réservé à l'admin. Utilise service_role pour contourner RLS.
 *
 * Body attendu :
 *   { marketId: string, outcomeId: string, resolvedByWallet: string }
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

    // ── Client service_role ────────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { marketId, outcomeId, resolvedByWallet } = await req.json() as {
      marketId: string;
      outcomeId: string;
      resolvedByWallet: string;
    };

    if (!marketId || !outcomeId || !resolvedByWallet) {
      return new Response(
        JSON.stringify({ error: "marketId, outcomeId et resolvedByWallet sont requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date().toISOString();

    // ── Résoudre le marché ─────────────────────────────────────────────────────
    const { error: marketError } = await supabase
      .from("prediction_markets")
      .update({
        is_resolved: true,
        is_active: false,          // désactive le marché pour qu'il quitte la vue publique
        resolution_outcome_id: outcomeId,
        resolved_at: now,
        resolved_by_wallet: resolvedByWallet,
      })
      .eq("id", marketId);

    if (marketError) {
      return new Response(
        JSON.stringify({ error: marketError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Mettre à jour les paris approuvés liés à ce marché ───────────────────
    const { error: betsError } = await supabase
      .from("prediction_history")
      .update({
        resolution_outcome_id: outcomeId,
        resolved_at: now,
        resolved_by_wallet: resolvedByWallet,
      })
      .eq("market_id", marketId)
      .eq("admin_decision_status", "approved");

    if (betsError) {
      console.error("[admin-resolve-market] Erreur mise à jour paris:", betsError.message);
      // Non bloquant — le marché est résolu, les paris peuvent être mis à jour manuellement
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

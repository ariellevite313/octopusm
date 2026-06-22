/**
 * Edge Function : admin-create-market
 *
 * Crée un nouveau marché de prédiction.
 * Réservé à l'admin. Utilise service_role pour contourner RLS.
 *
 * Body attendu : objet PredictionMarketRow (sans created_at / updated_at)
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

    const market = await req.json();

    if (!market || !market.id || !market.title) {
      return new Response(
        JSON.stringify({ error: "Corps de requête invalide — id et title requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data, error } = await supabase
      .from("prediction_markets")
      .insert(market)
      .select()
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

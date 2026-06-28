/**
 * mark-commission-claim-paid
 *
 * Admin marque une réclamation de commission (USDC + CLT) comme payée.
 * Vérifie que le wallet appelant est bien le wallet admin.
 *
 * Body: { claim_id: string, admin_wallet: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_WALLET = Deno.env.get("ADMIN_WALLET_ADDRESS") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { claim_id, admin_wallet } = await req.json() as {
      claim_id: string;
      admin_wallet: string;
    };

    if (!claim_id || !admin_wallet) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing claim_id or admin_wallet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Vérification admin via la table wallets
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: walletRow } = await supabase
      .from("wallets")
      .select("role")
      .eq("address", admin_wallet)
      .maybeSingle();

    if (!walletRow || walletRow.role !== "admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Récupérer le claim
    const { data: claim, error: fetchError } = await supabase
      .from("referral_commission_claims")
      .select("id, status, total_usdc, total_clt, referrer_wallet")
      .eq("id", claim_id)
      .maybeSingle();

    if (fetchError || !claim) {
      return new Response(
        JSON.stringify({ success: false, error: "Claim not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (claim.status === "paid") {
      return new Response(
        JSON.stringify({ success: false, error: "Claim already marked as paid" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Marquer comme payé
    const { error: updateError } = await supabase
      .from("referral_commission_claims")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_by_wallet: admin_wallet,
      })
      .eq("id", claim_id);

    if (updateError) {
      console.error("[mark-commission-claim-paid] update:", updateError.message);
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        claim_id,
        referrer_wallet: claim.referrer_wallet,
        total_usdc: claim.total_usdc,
        total_clt: claim.total_clt ?? 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[mark-commission-claim-paid] unexpected:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Edge Function : credit-bet-octo
 *
 * Crédite des OCTO après un pari confirmé.
 *
 * Formule USDC    : floor(amount_usd / 2) × 10
 *   Exemple : 100 USDC  → 500 OCTO
 *
 * Formule CLT     : floor(amount_clt / 25 000)
 *   Exemple : 500 000 CLT → 20 OCTO
 *
 * Body : { wallet_address, token, amount_usd?, amount_clt?, bet_id? }
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
    const { wallet_address, token, amount_usd, amount_clt } = await req.json() as {
      wallet_address?: string;
      token?: string;
      amount_usd?: number;
      amount_clt?: number;
    };

    if (!wallet_address) {
      return new Response(
        JSON.stringify({ error: "wallet_address requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let octo_amount = 0;

    if (token === "clawdtrust") {
      if (amount_clt == null || amount_clt <= 0) {
        return new Response(
          JSON.stringify({ error: "amount_clt (> 0) requis pour le token clawdtrust" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // 25 000 CLT = 1 OCTO, minimum 1 OCTO par transaction
      octo_amount = Math.max(1, Math.floor(amount_clt / 25000));
    } else {
      // USDC par défaut
      if (amount_usd == null || amount_usd <= 0) {
        return new Response(
          JSON.stringify({ error: "amount_usd (> 0) requis pour le token usdc" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // floor(mise / 2) × 10, minimum 1 OCTO par transaction
      octo_amount = Math.max(1, Math.floor(amount_usd / 2) * 10);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { error } = await supabase
      .from("octo_transactions")
      .insert({
        wallet_address,
        type: "bet",
        amount: octo_amount,
        bet_amount_usd: token === "clawdtrust" ? null : (amount_usd ?? null),
      });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, octo_credited: octo_amount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

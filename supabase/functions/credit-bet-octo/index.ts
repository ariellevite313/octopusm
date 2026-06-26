/**
 * Edge Function : credit-bet-octo
 *
 * Crédite des OCTO après un pari confirmé.
 * Formule : floor(amount_usd / 2) * 10
 * Exemple : 100$ → 500 OCTO
 *
 * Body attendu : { wallet_address: string, amount_usd: number, bet_id?: string }
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
    const { wallet_address, amount_usd } = await req.json() as {
      wallet_address?: string;
      amount_usd?: number;
    };

    if (!wallet_address || amount_usd == null || amount_usd <= 0) {
      return new Response(
        JSON.stringify({ error: "wallet_address et amount_usd (> 0) requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const octo_amount = Math.floor(amount_usd / 2) * 10;

    // Montant trop faible pour gagner des OCTO (< 2$)
    if (octo_amount === 0) {
      return new Response(
        JSON.stringify({ success: true, octo_credited: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
        bet_amount_usd: amount_usd,
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

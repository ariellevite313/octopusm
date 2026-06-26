/**
 * Edge Function : get-or-create-referral-code
 *
 * Retourne le code OCT-XXXXXX d'un wallet, le crée s'il n'existe pas encore.
 * Body attendu : { wallet_address: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O/1/I pour éviter confusion
  let code = "OCT-";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { wallet_address } = await req.json() as { wallet_address?: string };

    if (!wallet_address) {
      return new Response(
        JSON.stringify({ error: "wallet_address requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Vérifier si un code existe déjà
    const { data: existing } = await supabase
      .from("referral_codes")
      .select("code")
      .eq("wallet_address", wallet_address)
      .single();

    if (existing?.code) {
      return new Response(
        JSON.stringify({ success: true, code: existing.code }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Générer un code unique (retry si collision)
    let code = "";
    let attempts = 0;
    while (attempts < 10) {
      const candidate = generateCode();
      const { data: collision } = await supabase
        .from("referral_codes")
        .select("code")
        .eq("code", candidate)
        .single();

      if (!collision) {
        code = candidate;
        break;
      }
      attempts++;
    }

    if (!code) {
      return new Response(
        JSON.stringify({ error: "Impossible de générer un code unique" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error } = await supabase
      .from("referral_codes")
      .insert({ wallet_address, code });

    if (error) {
      // Race condition : un autre insert a réussi en parallèle → relire
      const { data: retry } = await supabase
        .from("referral_codes")
        .select("code")
        .eq("wallet_address", wallet_address)
        .single();

      if (retry?.code) {
        return new Response(
          JSON.stringify({ success: true, code: retry.code }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, code }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

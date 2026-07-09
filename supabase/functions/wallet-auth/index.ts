/**
 * Supabase Edge Function : wallet-auth
 *
 * Flow :
 *   1. Vérifie la signature ed25519 du wallet
 *   2. Sign-in rapide (fast path pour les users existants)
 *   3. Si échec → createUser (nouveau) ou updateUserById (password obsolète)
 *   4. Returns { access_token, refresh_token }
 *
 * Déploiement :
 *   supabase functions deploy wallet-auth --no-verify-jwt
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import nacl from "https://esm.sh/tweetnacl@1.0.3";
import bs58 from "https://esm.sh/bs58@5.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Password déterministe : HMAC-SHA256(walletAddress, SERVICE_ROLE_KEY) → base64url
async function derivePassword(walletAddress: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(walletAddress));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { walletAddress, signature, nonce, message } = await req.json();

    // ── Validation ────────────────────────────────────────────────────────
    if (!walletAddress || !signature || !nonce || !message) {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Vérification signature ed25519 ────────────────────────────────────
    const signatureBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    const messageBytes   = Uint8Array.from(atob(message),   (c) => c.charCodeAt(0));
    const publicKeyBytes = bs58.decode(walletAddress);

    if (!nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)) {
      return new Response(
        JSON.stringify({ error: "Signature invalide." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Anti-replay < 5 min ───────────────────────────────────────────────
    const decoded = new TextDecoder().decode(messageBytes);
    const timeMatch = decoded.match(/Heure\s+:\s+(\S+)/);
    if (timeMatch && Date.now() - new Date(timeMatch[1]).getTime() > 5 * 60 * 1000) {
      return new Response(
        JSON.stringify({ error: "Message expiré. Reconnecte-toi." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Clients Supabase ──────────────────────────────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const fakeEmail = `${walletAddress.toLowerCase()}@octopus-market.wallet`;
    const password  = await derivePassword(walletAddress, serviceKey);

    // ── Fast path : sign-in direct (user existant avec bon password) ──────
    let { data: session } = await anon.auth.signInWithPassword({ email: fakeEmail, password });

    if (!session?.session) {
      // ── Tentative de création (nouveau user) ──────────────────────────
      const { data: created } = await admin.auth.admin.createUser({
        email: fakeEmail,
        password,
        email_confirm: true,
        user_metadata: { wallet_address: walletAddress },
      });

      if (created?.user?.id) {
        // Nouveau user créé — sign in
        const r = await anon.auth.signInWithPassword({ email: fakeEmail, password });
        if (!r.data?.session) throw new Error(`Sign in failed: ${r.error?.message}`);
        session = r.data;
      } else {
        // User existant avec ancien password → trouver + mettre à jour
        let userId = "";
        for (let page = 1; page <= 20 && !userId; page++) {
          const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 50 });
          if (!list?.users?.length) break;
          // deno-lint-ignore no-explicit-any
          const match = list.users.find((u: any) => u.email === fakeEmail);
          if (match) userId = match.id;
        }
        if (!userId) throw new Error("Utilisateur introuvable.");

        // Mise à jour du password vers le nouveau schéma déterministe
        await admin.auth.admin.updateUserById(userId, { password });

        // Sign in avec le nouveau password
        const r = await anon.auth.signInWithPassword({ email: fakeEmail, password });
        if (!r.data?.session) throw new Error(`Sign in failed after update: ${r.error?.message}`);
        session = r.data;
      }
    }

    const { access_token, refresh_token } = session.session!;

    return new Response(
      JSON.stringify({ access_token, refresh_token, wallet_address: walletAddress }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[wallet-auth]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

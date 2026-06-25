/**
 * Supabase Edge Function : wallet-auth
 *
 * Reçoit : { walletAddress, signature, nonce, message }
 * Vérifie la signature ed25519 (Phantom/Solana)
 * Retourne : { access_token, refresh_token }
 *
 * Déploiement :
 *   supabase functions deploy wallet-auth --no-verify-jwt
 *
 * Variables d'environnement requises dans Supabase Dashboard :
 *   SUPABASE_URL         (automatique)
 *   SUPABASE_SERVICE_ROLE_KEY  (automatique)
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

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { walletAddress, signature, nonce, message } = await req.json();

    // ── Validation des paramètres ─────────────────────────────────────────
    if (!walletAddress || !signature || !nonce || !message) {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Vérification de la signature ed25519 ──────────────────────────────
    const signatureBytes = Uint8Array.from(atob(signature), (c) =>
      c.charCodeAt(0)
    );
    const messageBytes = Uint8Array.from(atob(message), (c) =>
      c.charCodeAt(0)
    );
    const publicKeyBytes = bs58.decode(walletAddress);

    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );

    if (!isValid) {
      return new Response(
        JSON.stringify({ error: "Signature invalide." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Vérifier que le nonce est récent (anti-replay) ────────────────────
    // Le message contient "Heure   : <ISO>" — on vérifie qu'il date de < 5 min
    const decodedMessage = new TextDecoder().decode(messageBytes);
    const timeMatch = decodedMessage.match(/Heure\s+:\s+(\S+)/);
    if (timeMatch) {
      const signedAt = new Date(timeMatch[1]).getTime();
      const now = Date.now();
      if (now - signedAt > 5 * 60 * 1000) {
        return new Response(
          JSON.stringify({ error: "Message expiré. Reconnecte-toi." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Créer ou récupérer l'utilisateur Supabase Auth ────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Email fictif basé sur l'adresse wallet (Supabase Auth exige un email)
    // L'email est déterministe : même wallet → même email → pas de doublon
    const fakeEmail = `${walletAddress.toLowerCase()}@octopus-market.wallet`;

    // ── Chercher l'utilisateur par email (O(1) au lieu de scanner tous les users)
    // Remplace listUsers() qui plafonne à 1000 utilisateurs et est O(n).
    let userId: string;

    const { data: existingUser, error: getUserError } =
      await supabaseAdmin.auth.admin.getUserByEmail(fakeEmail);

    if (!getUserError && existingUser?.user?.id) {
      // Utilisateur trouvé — réutiliser son ID
      userId = existingUser.user.id;
    } else {
      // Utilisateur inconnu — le créer
      const { data: newUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email: fakeEmail,
          email_confirm: true,
          user_metadata: {
            wallet_address: walletAddress,
          },
        });

      if (createError || !newUser.user) {
        throw new Error(`Création utilisateur échouée : ${createError?.message}`);
      }
      userId = newUser.user.id;
    }

    // ── Générer un token de session ────────────────────────────────────────
    const { data: sessionData, error: sessionError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: fakeEmail,
        options: {
          data: { wallet_address: walletAddress },
        },
      });

    if (sessionError || !sessionData) {
      throw new Error(`Génération de lien échouée : ${sessionError?.message}`);
    }

    // Extraire les tokens depuis le lien magique
    const url = new URL(sessionData.properties?.action_link ?? "");
    const accessToken = url.searchParams.get("access_token");
    const refreshToken = url.searchParams.get("refresh_token");

    if (!accessToken || !refreshToken) {
      throw new Error("Impossible d'extraire les tokens du lien magique.");
    }

    return new Response(
      JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        wallet_address: walletAddress,
        user_id: userId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[wallet-auth]", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Erreur interne.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

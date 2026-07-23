/**
 * Supabase Edge Function : wallet-auth
 *
 * Flow :
 *   1. Vérifie la signature ed25519 du wallet
 *   2. Sign-in rapide (fast path pour les users existants)
 *   3. Si échec → createUser (nouveau) ou updateUserById (password obsolète)
 *   4. Upsert dans la table `wallets` (création ou mise à jour last_connected_at)
 *   5. Si nouveau user + ref_code → enregistre le parrainage + crédite OCTO
 *   6. Returns { access_token, refresh_token }
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const { walletAddress, signature, nonce, message, ref_code } = await req.json();

    // ── Validation ────────────────────────────────────────────────────────
    if (!walletAddress || !signature || !nonce || !message) {
      return new Response(
        JSON.stringify({ error: "Missing parameters." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Vérification signature ed25519 ────────────────────────────────────
    const signatureBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    const messageBytes   = Uint8Array.from(atob(message),   (c) => c.charCodeAt(0));
    const publicKeyBytes = bs58.decode(walletAddress);

    if (!nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)) {
      return new Response(
        JSON.stringify({ error: "Invalid signature." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Anti-replay < 5 min ───────────────────────────────────────────────
    const decoded = new TextDecoder().decode(messageBytes);
    const timeMatch = decoded.match(/Timestamp:\s+(\S+)/);
    if (timeMatch) {
      const msgTime = new Date(timeMatch[1]).getTime();
      if (isNaN(msgTime) || Date.now() - msgTime > 5 * 60 * 1000) {
        return new Response(
          JSON.stringify({ error: "Message expired. Please sign in again." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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

    // ── Auth : fast path → new user → password reset ──────────────────────
    let isNewUser = false;
    let { data: session } = await anon.auth.signInWithPassword({ email: fakeEmail, password });

    if (!session?.session) {
      const { data: created } = await admin.auth.admin.createUser({
        email: fakeEmail,
        password,
        email_confirm: true,
        user_metadata: { wallet_address: walletAddress },
      });

      if (created?.user?.id) {
        isNewUser = true;
        const r = await anon.auth.signInWithPassword({ email: fakeEmail, password });
        if (!r.data?.session) throw new Error(`Sign in failed: ${r.error?.message}`);
        session = r.data;
      } else {
        // Existing user with old password — find and update
        const { data: found } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        // deno-lint-ignore no-explicit-any
        const match = found?.users?.find((u: any) => u.email === fakeEmail);
        if (!match) throw new Error("User not found.");
        await admin.auth.admin.updateUserById(match.id, { password });
        const r = await anon.auth.signInWithPassword({ email: fakeEmail, password });
        if (!r.data?.session) throw new Error(`Sign in failed after update: ${r.error?.message}`);
        session = r.data;
      }
    }

    const { access_token, refresh_token } = session.session!;
    const now = new Date().toISOString();

    // ── Upsert wallet row ─────────────────────────────────────────────────
    // Critical: all FK constraints on payments/bets reference wallets.address
    try {
      const { data: existingWallet } = await admin
        .from("wallets")
        .select("address, connection_count")
        .eq("address", walletAddress)
        .maybeSingle();

      if (!existingWallet) {
        // New wallet row — insert with all required defaults
        await admin.from("wallets").insert({
          address: walletAddress,
          role: "user",
          status: "active",
          first_connected_at: now,
          last_connected_at: now,
          connection_count: 1,
          latest_activity_at: now,
          latest_activity_label: "First connection",
          payment_count: 0,
          approved_payment_count: 0,
          pending_payment_count: 0,
          rejected_payment_count: 0,
          total_paid_usdc: 0,
          total_won_usdc: 0,
          total_lost_usdc: 0,
          total_claimed_usdc: 0,
        });
      } else {
        // Existing wallet — update connection tracking only
        await admin.from("wallets").update({
          last_connected_at: now,
          connection_count: (existingWallet.connection_count ?? 0) + 1,
          latest_activity_at: now,
          latest_activity_label: "Connected",
        }).eq("address", walletAddress);
      }
    } catch (walletErr) {
      // Log but never block auth
      console.error("[wallet-auth] wallets upsert error:", walletErr);
    }

    // ── New user only : generate referral code + handle parrainage ────────
    if (isNewUser) {
      // Generate unique referral code
      try {
        const code = Array.from(crypto.getRandomValues(new Uint8Array(6)))
          .map((b) => b.toString(36).toUpperCase().padStart(2, "0"))
          .join("")
          .slice(0, 8);
        await admin.from("referral_codes").upsert(
          { wallet_address: walletAddress, code },
          { onConflict: "wallet_address" },
        );
      } catch (codeErr) {
        console.error("[wallet-auth] referral code generation error:", codeErr);
      }

      // Handle referral if ref_code provided
      if (ref_code && typeof ref_code === "string") {
        try {
          // Resolve code → referrer wallet
          const { data: codeRow } = await admin
            .from("referral_codes")
            .select("wallet_address")
            .eq("code", ref_code)
            .maybeSingle();

          const referrerWallet: string | null = codeRow?.wallet_address ?? null;

          if (referrerWallet && referrerWallet !== walletAddress) {
            // Idempotency check
            const { data: existing } = await admin
              .from("referrals")
              .select("id")
              .eq("referrer_wallet", referrerWallet)
              .eq("referred_wallet", walletAddress)
              .maybeSingle();

            if (!existing) {
              // Record the referral relationship
              const { error: refErr } = await admin.from("referrals").insert({
                referrer_wallet: referrerWallet,
                referred_wallet: walletAddress,
              });

              // 23505 = race condition, already inserted — still credit OCTO
              if (!refErr || refErr.code === "23505") {
                if (!refErr) {
                  // +10 OCTO to referrer, +5 OCTO to new user
                  await admin.from("octo_transactions").insert([
                    {
                      wallet_address: referrerWallet,
                      type: "referral",
                      amount: 10,
                      ref_wallet: walletAddress,
                    },
                    {
                      wallet_address: walletAddress,
                      type: "referral",
                      amount: 5,
                      ref_wallet: referrerWallet,
                    },
                  ]);
                }
              }
            }
          }
        } catch (refErr) {
          console.error("[wallet-auth] referral error:", refErr);
        }
      }
    }

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

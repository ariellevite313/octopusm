/**
 * POST /api/auth/privy  { token }  — connexion avec X (Privy).
 * Verifie le jeton Privy cote serveur, lit le compte X lie et le wallet Solana embarque (cree par Privy),
 * puis ouvre une session Supabase pour ce wallet, comme la fonction wallet-auth.
 * Rien n'est lu dans le corps de la requete a part le jeton : l'identite vient uniquement de Privy.
 */
import { NextResponse } from "next/server";
import { createClient as createSb } from "@supabase/supabase-js";
import { PrivyClient } from "@privy-io/server-auth";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function derivePassword(address: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(address));
  return Buffer.from(new Uint8Array(sig)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function POST(req: Request) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID, secret = process.env.PRIVY_APP_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!appId || !secret || !url || !anonKey || !serviceKey) return NextResponse.json({ error: "X sign-in is not configured" }, { status: 503 });

  let token: unknown;
  try { ({ token } = await req.json()); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (typeof token !== "string" || token.length < 20 || token.length > 4000) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  try {
    const privy = new PrivyClient(appId, secret);
    const claims = await privy.verifyAuthToken(token);          // signature, expiration, appId
    const user = await privy.getUser(claims.userId);
    // Comptes sociaux acceptés : X, GitHub, Twitch (Privy vérifie le compte, on ne lit que son résultat)
    const x = user.linkedAccounts.find((a) => a.type === "twitter_oauth") as { subject?: string; username?: string | null } | undefined;
    const other = user.linkedAccounts.find((a) => ["github_oauth", "twitch_oauth"].includes(a.type));
    if (!x?.subject && !other) return NextResponse.json({ error: "No social account linked" }, { status: 401 });
    // Wallet Solana embarque cree par Privy (jamais une adresse envoyee par le client)
    const w = user.linkedAccounts.find((a) => a.type === "wallet" && (a as { walletClientType?: string; chainType?: string }).walletClientType === "privy" && (a as { chainType?: string }).chainType === "solana") as { address?: string } | undefined;
    const address = w?.address;
    if (!address || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return NextResponse.json({ error: "Wallet not ready, try again" }, { status: 409 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    // Un compte X ne peut pas ouvrir un wallet different de celui deja lie
    if (x?.subject) {
      const { data: link } = await admin.from("x_links").select("wallet_address").eq("x_user_id", x.subject).maybeSingle();
      if (link && link.wallet_address !== address) return NextResponse.json({ error: "This X account is linked to another wallet" }, { status: 409 });
    }
    const { data: taken } = await admin.from("x_links").select("x_user_id, privy_user_id").eq("wallet_address", address).maybeSingle();
    if (taken && (x?.subject ? taken.x_user_id !== x.subject : taken.privy_user_id !== claims.userId)) return NextResponse.json({ error: "This wallet is linked to another account" }, { status: 409 });

    const email = `${address.toLowerCase()}@octopus-market.wallet`;
    const password = await derivePassword(address, serviceKey);
    const anon = createSb(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    let isNew = false;
    let s = await anon.auth.signInWithPassword({ email, password });
    if (!s.data.session) {
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { wallet_address: address }, app_metadata: { wallet_address: address, privy_user_id: claims.userId } });
      if (!created.data?.user?.id) return NextResponse.json({ error: "Could not create the account" }, { status: 500 });
      isNew = true;
      s = await anon.auth.signInWithPassword({ email, password });
    }
    if (!s.data.session) return NextResponse.json({ error: "Sign-in failed" }, { status: 500 });

    const now = new Date().toISOString();
    const { data: row } = await admin.from("wallets").select("address, connection_count").eq("address", address).maybeSingle();
    if (!row) {
      await admin.from("wallets").insert({
        address, role: "user", status: "active", first_connected_at: now, last_connected_at: now, connection_count: 1,
        latest_activity_at: now, latest_activity_label: "First connection", payment_count: 0, approved_payment_count: 0,
        pending_payment_count: 0, rejected_payment_count: 0, total_paid_usdc: 0, total_won_usdc: 0, total_lost_usdc: 0, total_claimed_usdc: 0,
        ...(x?.username ? { twitter_handle: x.username } : {}),
      });
    } else {
      await admin.from("wallets").update({ last_connected_at: now, connection_count: (row.connection_count ?? 0) + 1, latest_activity_at: now, latest_activity_label: "Connected" }).eq("address", address);
    }
    if (x?.subject) await admin.from("x_links").upsert({ x_user_id: x.subject, privy_user_id: claims.userId, wallet_address: address, x_username: x.username ?? null, updated_at: now }, { onConflict: "x_user_id" });
    if (isNew) {
      const code = Array.from(crypto.getRandomValues(new Uint8Array(6))).map((b) => b.toString(36).toUpperCase().padStart(2, "0")).join("").slice(0, 8);
      await admin.from("referral_codes").upsert({ wallet_address: address, code }, { onConflict: "wallet_address" });
    }
    return NextResponse.json({ access_token: s.data.session.access_token, refresh_token: s.data.session.refresh_token, wallet: address });
  } catch (e) {
    console.error("[auth/privy]", e);
    return NextResponse.json({ error: "Sign-in failed" }, { status: 401 });
  }
}

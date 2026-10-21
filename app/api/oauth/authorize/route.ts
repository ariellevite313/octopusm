/**
 * POST /api/oauth/authorize — décision de l'utilisateur connecté (wallet) sur la page /oauth/authorize.
 * Renvoie l'URL de redirection vers l'assistant (avec code, ou erreur access_denied).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { CODE_TTL_S, newToken, parseScopes, sha256 } from "@/lib/oauth/core";

export async function POST(req: Request) {
  // Même origine uniquement (anti-CSRF)
  const o = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  if (o) {
    let oh = "";
    try { oh = new URL(o).host; } catch { /* origine invalide */ }
    if (oh !== host) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const b = (await req.json().catch(() => ({}))) as {
    client_id?: string; redirect_uri?: string; state?: string; code_challenge?: string; code_challenge_method?: string; scope?: string; approve?: boolean;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: client } = await admin.from("oauth_clients").select("client_id, redirect_uris").eq("client_id", b.client_id ?? "").maybeSingle();
  if (!client || !b.redirect_uri || !(client.redirect_uris as string[]).includes(b.redirect_uri)) {
    return NextResponse.json({ error: "Unknown application or redirect address" }, { status: 400 });
  }
  const back = new URL(b.redirect_uri);
  if (b.state) back.searchParams.set("state", b.state);
  if (!b.approve) {
    back.searchParams.set("error", "access_denied");
    return NextResponse.json({ redirect: back.toString() });
  }
  if (!b.code_challenge || (b.code_challenge_method ?? "S256") !== "S256") {
    return NextResponse.json({ error: "PKCE (S256) is required" }, { status: 400 });
  }
  const code = newToken("omc");
  const { error } = await admin.from("oauth_codes").insert({
    code_hash: sha256(code), client_id: client.client_id, wallet: s.wallet, redirect_uri: b.redirect_uri,
    code_challenge: b.code_challenge, scopes: parseScopes(b.scope), expires_at: new Date(Date.now() + CODE_TTL_S * 1000).toISOString(),
  });
  if (error) return NextResponse.json({ error: "Could not create the authorization" }, { status: 500 });
  back.searchParams.set("code", code);
  return NextResponse.json({ redirect: back.toString() });
}

/** GET ?client_id=&redirect_uri= — nom de l'application pour la page d'autorisation. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("client_id") ?? "";
  const redirect = u.searchParams.get("redirect_uri") ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: client } = await (createAdminClient() as any).from("oauth_clients").select("client_name, redirect_uris").eq("client_id", id).maybeSingle();
  if (!client || !(client.redirect_uris as string[]).includes(redirect)) {
    return NextResponse.json({ error: "Unknown application or redirect address" }, { status: 404 });
  }
  return NextResponse.json({ name: client.client_name, redirect_host: new URL(redirect).host });
}

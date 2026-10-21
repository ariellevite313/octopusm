/** POST /api/oauth/token — échange du code (PKCE) ou rafraîchissement. Corps form-urlencoded ou JSON. */
import { createAdminClient } from "@/lib/supabase/server";
import { ACCESS_TTL_S, REFRESH_TTL_S, newToken, pkceOk, sha256 } from "@/lib/oauth/core";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version", "Cache-Control": "no-store" } as const;
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });

const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: CORS });

async function readBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return ((await req.json().catch(() => ({}))) ?? {}) as Record<string, string>;
  const text = await req.text();
  return Object.fromEntries(new URLSearchParams(text));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function issue(admin: any, client_id: string, wallet: string, scopes: string[]) {
  const access = newToken("oma"), refresh = newToken("omr");
  const now = Date.now();
  const { error } = await admin.from("oauth_tokens").insert({
    client_id, wallet, scopes, access_hash: sha256(access), refresh_hash: sha256(refresh),
    access_expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString(), refresh_expires_at: new Date(now + REFRESH_TTL_S * 1000).toISOString(),
  });
  if (error) return fail("server_error", 500);
  return Response.json({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: scopes.join(" ") }, { headers: CORS });
}

export async function POST(req: Request) {
  const b = await readBody(req);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  if (b.grant_type === "authorization_code") {
    if (!b.code || !b.code_verifier || !b.client_id || !b.redirect_uri) return fail("invalid_request");
    const { data: c } = await admin.from("oauth_codes").select("*").eq("code_hash", sha256(b.code)).maybeSingle();
    if (!c || c.used || new Date(c.expires_at).getTime() < Date.now() || c.client_id !== b.client_id || c.redirect_uri !== b.redirect_uri) return fail("invalid_grant");
    if (!pkceOk(b.code_verifier, c.code_challenge)) return fail("invalid_grant");
    // Usage unique (protection contre une double utilisation simultanée)
    const { data: claimed } = await admin.from("oauth_codes").update({ used: true }).eq("code_hash", c.code_hash).eq("used", false).select("code_hash");
    if (!claimed?.length) return fail("invalid_grant");
    return issue(admin, c.client_id, c.wallet, c.scopes);
  }

  if (b.grant_type === "refresh_token") {
    if (!b.refresh_token) return fail("invalid_request");
    const { data: t } = await admin.from("oauth_tokens").select("*").eq("refresh_hash", sha256(b.refresh_token)).maybeSingle();
    if (!t || t.revoked || new Date(t.refresh_expires_at).getTime() < Date.now() || (b.client_id && b.client_id !== t.client_id)) return fail("invalid_grant");
    // Rotation : l'ancien jeton est révoqué
    const { data: rot } = await admin.from("oauth_tokens").update({ revoked: true }).eq("id", t.id).eq("revoked", false).select("id");
    if (!rot?.length) return fail("invalid_grant");
    return issue(admin, t.client_id, t.wallet, t.scopes);
  }

  return fail("unsupported_grant_type");
}

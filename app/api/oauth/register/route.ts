/** Enregistrement dynamique d'un client OAuth (RFC 7591) — clients publics uniquement (PKCE). */
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { validRedirect } from "@/lib/oauth/core";
import { getIp, hit } from "@/lib/v1/launch";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version", "Cache-Control": "no-store" } as const;
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });

export async function POST(req: Request) {
  if (!hit(`oauth-reg:${getIp(req)}`, 20, 3600_000)) return Response.json({ error: "slow_down" }, { status: 429, headers: CORS });
  const body = (await req.json().catch(() => ({}))) as { redirect_uris?: unknown; client_name?: unknown };
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(validRedirect)) {
    return Response.json({ error: "invalid_redirect_uri", error_description: "redirect_uris must be https (or http://localhost)" }, { status: 400, headers: CORS });
  }
  const name = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 60) : "AI assistant";
  const client_id = `om_${randomBytes(16).toString("hex")}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (createAdminClient() as any).from("oauth_clients").insert({ client_id, client_name: name, redirect_uris: uris });
  if (error) return Response.json({ error: "server_error" }, { status: 500, headers: CORS });
  return Response.json({
    client_id, client_name: name, redirect_uris: uris,
    token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
    client_id_issued_at: Math.floor(Date.now() / 1000),
  }, { status: 201, headers: CORS });
}

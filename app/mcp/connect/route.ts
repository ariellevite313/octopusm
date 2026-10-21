/**
 * /mcp/connect — MCP du compte de l'utilisateur (connexion OAuth « en un clic » depuis Claude, ChatGPT…).
 * Sans jeton valide : 401 + WWW-Authenticate, ce qui déclenche l'écran « Connecter » de l'assistant.
 */
import { handleRpc } from "@/lib/mcp/server";
import { USER_INSTRUCTIONS, USER_TOOLS } from "@/lib/mcp/user-tools";
import { getIp, hit } from "@/lib/v1/launch";
import { createAdminClient } from "@/lib/supabase/server";
import { origin, sha256 } from "@/lib/oauth/core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
  "Cache-Control": "no-store",
} as const;

const MAX_BODY = 12 * 1024 * 1024;

function unauthorized(req: Request, error = "invalid_token") {
  const meta = `${origin(req)}/.well-known/oauth-protected-resource/mcp/connect`;
  return new Response(JSON.stringify({ error, error_description: "Connect your OMdotfun account" }), {
    status: 401,
    headers: { ...CORS, "Content-Type": "application/json", "WWW-Authenticate": `Bearer resource_metadata="${meta}", error="${error}"` },
  });
}

async function userFromToken(req: Request): Promise<{ wallet: string; scopes: string[] } | null> {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: t } = await admin.from("oauth_tokens").select("id, wallet, scopes, access_expires_at, revoked, last_used_at").eq("access_hash", sha256(m[1])).maybeSingle();
  if (!t || t.revoked || new Date(t.access_expires_at).getTime() < Date.now()) return null;
  if (!t.last_used_at || Date.now() - new Date(t.last_used_at).getTime() > 5 * 60_000) {
    await admin.from("oauth_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", t.id);
  }
  return { wallet: t.wallet, scopes: t.scopes ?? [] };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  // Pas de flux SSE : on indique simplement comment se connecter
  const user = await userFromToken(req);
  if (!user) return unauthorized(req);
  return Response.json({ name: "omdotfun", connected_wallet: user.wallet, tools: USER_TOOLS.map((t) => t.name) }, { headers: CORS });
}

export async function POST(req: Request) {
  const user = await userFromToken(req);
  if (!user) return unauthorized(req);
  if (!hit(`mcpc:${user.wallet}`, 120, 60_000) || !hit(`mcpc-ip:${getIp(req)}`, 240, 60_000)) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Rate limit reached" } }, { status: 429, headers: CORS });
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, { status: 413, headers: CORS });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS });
  }
  const result = await handleRpc(body, { origin: new URL(req.url).origin, ip: getIp(req), user }, { tools: USER_TOOLS, instructions: USER_INSTRUCTIONS });
  if (result === null) return new Response(null, { status: 202, headers: CORS });
  return Response.json(result, { headers: CORS });
}

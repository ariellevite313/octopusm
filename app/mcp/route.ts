/**
 * /mcp — serveur MCP d'OMdotfun (Streamable HTTP, sans état).
 *
 *   POST  → messages JSON-RPC (initialize, tools/list, tools/call…)
 *   GET   → carte d'identité lisible (outils, endpoint) pour les humains et les annuaires
 *
 * Connexion : claude mcp add --transport http omdotfun https://omdot.fun/mcp
 */
import { handleRpc, MCP_INFO } from "@/lib/mcp/server";
import { getIp, hit } from "@/lib/v1/launch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version",
  "Cache-Control": "no-store",
} as const;

const MAX_BODY = 12 * 1024 * 1024; // logo base64 jusqu'à 5 Mo + transactions

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET() {
  return Response.json(MCP_INFO, { headers: CORS });
}

export async function POST(req: Request) {
  const ip = getIp(req);
  // Limite par IP : 120 requêtes / minute
  if (!hit(`mcp:${ip}`, 120, 60_000)) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Rate limit reached" } }, { status: 429, headers: CORS });
  }

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, { status: 413, headers: CORS });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS });
  }

  const result = await handleRpc(body, { origin: new URL(req.url).origin, ip });
  if (result === null) return new Response(null, { status: 202, headers: CORS });
  return Response.json(result, { headers: CORS });
}

/** Enregistrement dynamique d'un client OAuth (RFC 7591) — clients publics uniquement (PKCE). */
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { validRedirect } from "@/lib/oauth/core";
import { getIp } from "@/lib/v1/launch";
import { rateHit } from "@/lib/rate-limit";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version", "Cache-Control": "no-store" } as const;
const BRANDS = [
  { re: /claude|anthropic/i, domains: ["claude.ai", "claude.com", "anthropic.com"] },
  { re: /chat\s*gpt|openai/i, domains: ["chatgpt.com", "openai.com"] },
  { re: /gemini|google/i, domains: ["google.com", "gemini.google.com"] },
  { re: /grok|xai|\bx\.ai\b/i, domains: ["x.ai", "grok.com"] },
  { re: /om\s*dot|omdotfun|octopus/i, domains: ["omdot.fun"] },
];
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });

export async function POST(req: Request) {
  if (!(await rateHit(`oauth-reg:${getIp(req)}`, 20, 3600_000))) return Response.json({ error: "slow_down" }, { status: 429, headers: CORS });
  const body = (await req.json().catch(() => ({}))) as { redirect_uris?: unknown; client_name?: unknown };
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(validRedirect)) {
    return Response.json({ error: "invalid_redirect_uri", error_description: "redirect_uris must be https (or http://localhost)" }, { status: 400, headers: CORS });
  }
  let name = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 60) : "AI assistant";
  // Anti-usurpation : un nom de marque connue n'est accepté que si la redirection va vers le domaine de cette marque
  const hosts = uris.map((u) => new URL(u).hostname.toLowerCase());
  const brand = BRANDS.find((b) => b.re.test(name));
  if (brand && !hosts.every((h) => h === "localhost" || h === "127.0.0.1" || brand.domains.some((d) => h === d || h.endsWith(`.${d}`)))) {
    name = `Unverified app (${hosts[0]})`;
  }
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

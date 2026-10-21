/** POST /api/oauth/revoke (RFC 7009) — révoque un jeton d'accès ou de rafraîchissement. */
import { createAdminClient } from "@/lib/supabase/server";
import { sha256 } from "@/lib/oauth/core";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version", "Cache-Control": "no-store" } as const;
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  const b = ct.includes("application/json") ? ((await req.json().catch(() => ({}))) as Record<string, string>) : Object.fromEntries(new URLSearchParams(await req.text()));
  if (b.token) {
    const h = sha256(b.token);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    await admin.from("oauth_tokens").update({ revoked: true }).or(`access_hash.eq.${h},refresh_hash.eq.${h}`);
  }
  return new Response(null, { status: 200, headers: CORS });
}

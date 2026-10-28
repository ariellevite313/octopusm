/**
 * lib/v1/launch.ts — helpers for the agent launch API (/api/v1/launch).
 * Thin wrappers over the existing /api/launchpad handlers (same on-chain flow, same checks).
 */
import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { getIp } from "@/lib/v1/helpers";
import { runAsAgent } from "@/lib/social/session";

export const LAUNCH_CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control":                "no-store",
} as const;

export function lOk() { return new Response(null, { status: 204, headers: LAUNCH_CORS }); }
export function lJson<T>(data: T, status = 200) { return NextResponse.json(data, { status, headers: LAUNCH_CORS }); }
export function lErr(msg: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: msg, ...extra }, { status, headers: LAUNCH_CORS });
}

export const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// ── Rate limit (in-memory, sliding window) ────────────────────────────────────
const _hits = new Map<string, number[]>();
export function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (_hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { _hits.set(key, arr); return false; }
  arr.push(now); _hits.set(key, arr);
  if (_hits.size > 5000) for (const [k, v] of _hits) if (!v.some((t) => now - t < windowMs)) _hits.delete(k);
  return true;
}
export { getIp };

/** Call an existing route handler with a JSON body. */
export async function callJson(
  handler: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>,
  id: string,
  body: unknown,
): Promise<{ status: number; data: Record<string, unknown> }> {
  // L'API agent n'a pas de session : le wallet annoncé sert d'identité aux gestionnaires partagés.
  // La preuve réelle de contrôle reste la signature du créateur dans les transactions et la lecture de la chaîne.
  const w = (body as { walletAddress?: string }).walletAddress;
  const run = () => handler(
    new Request("http://internal/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
  const res = await (w ? runAsAgent(w, run) : run());
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, data };
}

/** Poll until a signature is confirmed (or timeout). */
export async function waitConfirmed(sig: string, timeoutMs = 25_000): Promise<"confirmed" | "failed" | "pending"> {
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) return "pending";
  const conn = new Connection(rpc, "confirmed");
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const { value } = await conn.getSignatureStatuses([sig], { searchTransactionHistory: false });
    const s = value[0];
    if (s?.err) return "failed";
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) return "confirmed";
    await new Promise((r) => setTimeout(r, 1000));
  }
  return "pending";
}

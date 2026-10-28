/**
 * POST /api/arc-rpc
 *
 * Server-side proxy for Arc mainnet RPC calls.
 * Avoids CORS restrictions when the browser calls the Arc RPC directly.
 * Accepts a standard JSON-RPC body (only the methods the site uses) and forwards it to https://rpc.mainnet.arc.io.
 */
import { NextResponse } from "next/server";
import { guardRpc, ARC_METHODS } from "@/lib/rpc-guard";

const ARC_RPC = "https://rpc.mainnet.arc.io";

export async function POST(req: Request) {
  const g = await guardRpc(req, { name: "arc", methods: ARC_METHODS, perMinute: 240 });
  if (!g.ok) return g.response;
  const body = g.body as { id?: unknown } | { id?: unknown }[];
  const firstId = Array.isArray(body) ? body[0]?.id ?? null : body?.id ?? null;
  try {
    const res = await fetch(ARC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(g.body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { jsonrpc: "2.0", error: { code: -32603, message: `Arc RPC error: ${res.status}` }, id: firstId },
        { status: 502 },
      );
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32603, message: "Arc RPC unavailable" }, id: firstId },
      { status: 502 },
    );
  }
}

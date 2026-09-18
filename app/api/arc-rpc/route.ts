/**
 * POST /api/arc-rpc
 *
 * Server-side proxy for Arc mainnet RPC calls.
 * Avoids CORS restrictions when the browser calls the Arc RPC directly.
 * Accepts a standard JSON-RPC body and forwards it to https://rpc.mainnet.arc.io.
 */
import { NextResponse } from "next/server";

const ARC_RPC = "https://rpc.mainnet.arc.io";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(ARC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return NextResponse.json(
        { jsonrpc: "2.0", error: { code: -32603, message: `Arc RPC error: ${res.status}` }, id: body?.id ?? null },
        { status: 502 },
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32603, message: msg }, id: null },
      { status: 500 },
    );
  }
}

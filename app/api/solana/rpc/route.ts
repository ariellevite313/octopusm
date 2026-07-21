import { NextResponse } from "next/server";

/**
 * POST /api/solana/rpc
 * Server-side Solana JSON-RPC proxy.
 *
 * Why: public RPC endpoints block browser requests (CORS, 403, rate limits).
 * This proxy runs server-side where those restrictions don't apply.
 *
 * The client sends the exact JSON-RPC body; we forward it to the configured
 * RPC endpoint and return the response. The API key never reaches the browser.
 */

// Priority order: env var first (Helius / QuickNode), then reliable public fallbacks
// that work from a server (no CORS issues server-side).
function getRpcUrls(): string[] {
  const envUrl = process.env.SOLANA_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  const fallbacks = [
    "https://api.mainnet-beta.solana.com",
    "https://solana-rpc.publicnode.com",
    "https://rpc.ankr.com/solana",
  ];
  return envUrl ? [envUrl, ...fallbacks] : fallbacks;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rpcUrls = getRpcUrls();
  const errors: string[] = [];

  for (const url of rpcUrls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        // 10s timeout via AbortController
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        errors.push(`${url} → HTTP ${res.status}: ${text.slice(0, 200)}`);
        continue;
      }

      const data = await res.json();

      // Some RPCs return 200 but with an error in the JSON-RPC body.
      // Propagate these so the client can handle them (e.g. insufficient funds).
      // But still return 200 — it's a valid JSON-RPC response.
      return NextResponse.json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${url} → ${msg}`);
    }
  }

  // All endpoints failed
  console.error("[solana/rpc] All RPC endpoints failed:", errors);
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: "All Solana RPC endpoints are unavailable. Try again in a moment.",
        data: errors,
      },
    },
    { status: 503 }
  );
}

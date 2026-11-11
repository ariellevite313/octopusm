/** GET /api/terminal?list=trending|new  ou  ?q=… : tokens Solana pour le Terminal OM. */
import { NextResponse } from "next/server";
import { arcList, CHAINS, terminalList, type TerminalChain } from "@/lib/terminal";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 60);
  const l = u.searchParams.get("list");
  const list = l === "new" ? "new" : l === "volume" ? "volume" : "trending";
  const c = u.searchParams.get("chain") ?? "solana";
  const chain: TerminalChain = CHAINS.some((x) => x.id === c) ? (c as TerminalChain) : "solana";
  try {
    const kind = q.length >= 2 ? "search" : list;
    const tokens = chain === "arc" ? await arcList(createAdminClient(), kind, q) : await terminalList(kind, q, chain);
    return NextResponse.json({ tokens }, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch {
    return NextResponse.json({ tokens: [], error: "Market data unavailable" }, { status: 502 });
  }
}

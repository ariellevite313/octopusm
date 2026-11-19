/** GET /api/terminal/pulse : nouveaux tokens, proches de la graduation, tout juste migrés (Solana et autres réseaux du Terminal). */
import { NextResponse } from "next/server";
import { limited } from "@/lib/limit";
import { pulse } from "@/lib/terminal-pulse";
import { GT_NET, type TerminalChain } from "@/lib/terminal";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  { const lim = await limited(req, "pulse", 60); if (lim) return lim; }
  const c = new URL(req.url).searchParams.get("chain") ?? "solana";
  const chain = (c in GT_NET && GT_NET[c as TerminalChain] ? c : "solana") as TerminalChain;
  return NextResponse.json(await pulse(chain), { headers: { "Cache-Control": "public, max-age=10, s-maxage=15" } });
}

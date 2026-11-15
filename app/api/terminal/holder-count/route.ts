/**
 * GET /api/terminal/holder-count?chain=…&mint=…
 * Nombre de holders d'un token quand la liste complète n'est pas lisible (gros token, RPC limité, réseau sans explorateur branché).
 * Source : GeckoTerminal (fiche du token), sinon l'explorateur Blockscout du réseau. null si aucune source ne répond.
 */
import { NextResponse } from "next/server";
import { GT_NET, type TerminalChain } from "@/lib/terminal";

export const revalidate = 300;

const BLOCKSCOUT: Partial<Record<TerminalChain, string>> = {
  ethereum: "https://eth.blockscout.com", base: "https://base.blockscout.com", arbitrum: "https://arbitrum.blockscout.com",
  polygon: "https://polygon.blockscout.com", robinhood: "https://robinhoodchain.blockscout.com",
};
const opt = { headers: { accept: "application/json" }, signal: AbortSignal.timeout(7000), next: { revalidate: 300 } } as const;
const json = (count: number | null) => NextResponse.json({ count }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });

export async function GET(req: Request) {
  const u = new URL(req.url);
  const chain = (u.searchParams.get("chain") ?? "solana") as TerminalChain;
  const mint = u.searchParams.get("mint") ?? "";
  if (!/^[A-Za-z0-9]{32,44}$/.test(mint) && !/^0x[0-9a-fA-F]{40}$/.test(mint)) return NextResponse.json({ error: "invalid token" }, { status: 400 });
  const net = chain === "solana" ? "solana" : GT_NET[chain] ?? chain;
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${mint}/info`, opt);
    if (r.ok) {
      const j = await r.json() as { data?: { attributes?: { holders?: { count?: number } | null } } };
      const c = j.data?.attributes?.holders?.count;
      if (typeof c === "number" && c > 0) return json(c);
    }
  } catch { /* source suivante */ }
  const base = BLOCKSCOUT[chain];
  if (base) {
    try {
      const r = await fetch(`${base}/api/v2/tokens/${mint}`, opt);
      if (r.ok) {
        const j = await r.json() as { holders_count?: string; holders?: string };
        const c = Number(j.holders_count ?? j.holders);
        if (Number.isFinite(c) && c > 0) return json(c);
      }
    } catch { /* aucune source */ }
  }
  return json(null);
}

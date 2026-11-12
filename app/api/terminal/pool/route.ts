/** GET /api/terminal/pool?chain=…&mint=…  La pool la plus liquide d'un token (pour son graphique), via GeckoTerminal. */
import { NextResponse } from "next/server";
import { GT_NET, type TerminalChain } from "@/lib/terminal";

export const revalidate = 600;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const chain = (u.searchParams.get("chain") ?? "solana") as TerminalChain;
  const mint = u.searchParams.get("mint") ?? "";
  const net = GT_NET[chain];
  if (!net || !/^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(mint)) return NextResponse.json({ pool: null });
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${mint}/pools?page=1&sort=h24_volume_usd_liquidity_desc`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000), next: { revalidate: 600 } });
    if (!r.ok) return NextResponse.json({ pool: null });
    const j = (await r.json()) as { data?: { attributes?: { address?: string }; relationships?: { base_token?: { data?: { id?: string } } } }[] };
    const lower = mint.toLowerCase();
    // De préférence une pool où le token est la base (le prix du graphique est alors le sien)
    const p = (j.data ?? []).find((x) => (x.relationships?.base_token?.data?.id ?? "").toLowerCase().endsWith(`_${lower}`)) ?? null;
    return NextResponse.json({ pool: p?.attributes?.address ?? null }, { headers: { "Cache-Control": "public, s-maxage=600" } });
  } catch { return NextResponse.json({ pool: null }); }
}

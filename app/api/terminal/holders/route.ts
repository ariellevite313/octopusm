/**
 * GET /api/terminal/holders?chain=…&token=0x…
 * Les plus gros holders d'un token EVM, via les explorateurs Blockscout publics (même format que les holders Solana).
 */
import { NextResponse } from "next/server";
import type { TerminalChain } from "@/lib/terminal";

export const revalidate = 300;

const BLOCKSCOUT: Partial<Record<TerminalChain, string>> = {
  ethereum: "https://eth.blockscout.com", base: "https://base.blockscout.com", arbitrum: "https://arbitrum.blockscout.com",
  polygon: "https://polygon.blockscout.com", robinhood: "https://robinhoodchain.blockscout.com",
};

type Item = { address?: { hash?: string; is_contract?: boolean; name?: string | null }; value?: string };

export async function GET(req: Request) {
  const u = new URL(req.url);
  const chain = (u.searchParams.get("chain") ?? "") as TerminalChain;
  const token = u.searchParams.get("token") ?? "";
  const base = BLOCKSCOUT[chain];
  if (!base) return NextResponse.json({ error: "unsupported" }, { status: 404 });
  if (!/^0x[0-9a-fA-F]{40}$/.test(token)) return NextResponse.json({ error: "invalid token" }, { status: 400 });
  try {
    const opt = { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000), next: { revalidate: 300 } };
    const [info, list] = await Promise.all([
      fetch(`${base}/api/v2/tokens/${token}`, opt).then((r) => (r.ok ? r.json() : null)) as Promise<{ decimals?: string; total_supply?: string; holders_count?: string; holders?: string } | null>,
      fetch(`${base}/api/v2/tokens/${token}/holders`, opt).then((r) => (r.ok ? r.json() : null)) as Promise<{ items?: Item[] } | null>,
    ]);
    if (!info || !list?.items) return NextResponse.json({ error: "unavailable" }, { status: 502 });
    const dec = Number(info.decimals ?? 18);
    const supply = Number(info.total_supply ?? 0);
    const holders = list.items.filter((x) => x.address?.hash).slice(0, 100).map((x, i) => {
      const raw = Number(x.value ?? 0);
      return {
        rank: i + 1, owner: x.address!.hash!, amount: raw / 10 ** dec, pct: supply > 0 ? (raw / supply) * 100 : 0,
        isProgram: !!x.address?.is_contract, name: null, avatar: null,
      };
    });
    return NextResponse.json({ holders, total: Number(info.holders_count ?? info.holders ?? holders.length), partial: true }, { headers: { "Cache-Control": "public, s-maxage=300" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}

/**
 * GET /api/bags/evm?chain=base&address=0x… [&token=0x…]
 * Tokens d'un wallet EVM pour « Chill ton sac ». Sans `token` : liste lue sur l'explorateur Blockscout quand le réseau en a un
 * (Ethereum, Base, Arbitrum, Polygon), sinon `manual: true` (la personne colle l'adresse du token). Avec `token` : sa fiche
 * (solde lu sur la chaîne, prix DexScreener). Lecture seule.
 */
import { NextResponse } from "next/server";
import { isAddr, isEvmChain } from "@/lib/swap/evm";
import { evmHolding } from "@/lib/swap/chill-evm";

export const dynamic = "force-dynamic";
const BLOCKSCOUT: Record<string, string> = {
  ethereum: "https://eth.blockscout.com", base: "https://base.blockscout.com", arbitrum: "https://arbitrum.blockscout.com", polygon: "https://polygon.blockscout.com",
};
type Item = { token?: { address_hash?: string; address?: string; name?: string; symbol?: string; decimals?: string; exchange_rate?: string | null; icon_url?: string | null; type?: string }; value?: string };
const https = (u?: string | null) => (u && /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : null);

export async function GET(req: Request) {
  const u = new URL(req.url);
  const chain = u.searchParams.get("chain");
  const address = (u.searchParams.get("address") ?? "").toLowerCase();
  const token = (u.searchParams.get("token") ?? "").toLowerCase();
  if (!isEvmChain(chain) || !isAddr(address)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if (token) {
    if (!isAddr(token)) return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    const h = await evmHolding(chain, address, token);
    if (!h.meta) return NextResponse.json({ error: "No market for this token yet" }, { status: 404 });
    return NextResponse.json({ bag: { id: token, symbol: h.meta.symbol, name: h.meta.name || h.meta.symbol, logo: h.meta.logo, amount: h.amount, price: h.price, value: h.usd } });
  }

  const base = BLOCKSCOUT[chain];
  if (!base) return NextResponse.json({ bags: [], manual: true });
  try {
    const r = await fetch(`${base}/api/v2/addresses/${address}/token-balances`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!r.ok) return NextResponse.json({ bags: [], manual: true });
    const items = (await r.json()) as Item[];
    const bags = items.flatMap((i) => {
      const t = i.token; const addr = (t?.address_hash ?? t?.address ?? "").toLowerCase();
      if (!t || t.type !== "ERC-20" || !isAddr(addr)) return [];
      const price = t.exchange_rate ? Number(t.exchange_rate) : null;
      const amount = Number(BigInt(i.value ?? "0")) / 10 ** Number(t.decimals ?? 18);
      const value = price != null && price > 0 ? amount * price : null;
      return value != null && value >= 1 ? [{ id: addr, symbol: (t.symbol ?? "").slice(0, 16), name: (t.name ?? t.symbol ?? "").slice(0, 40), logo: https(t.icon_url), amount, price, value }] : [];
    }).sort((a, b) => b.value - a.value).slice(0, 40);
    return NextResponse.json({ bags, manual: bags.length === 0 });
  } catch { return NextResponse.json({ bags: [], manual: true }); }
}

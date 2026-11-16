/**
 * GET /api/bags/arc?address=0x… [&token=0x…]
 * Tokens d'un wallet sur Arc pour « Chill ton sac ». Sans `token` : liste lue sur ArcScan quand il répond, sinon `manual: true`
 * (la personne colle l'adresse du token). Avec `token` : sa fiche (solde lu sur la chaîne, prix du routeur OM). Lecture seule.
 */
import { NextResponse } from "next/server";
import { isAddr } from "@/lib/swap/evm";
import { arcHolding } from "@/lib/swap/chill-arc";

export const dynamic = "force-dynamic";
const https = (u?: string | null) => (u && /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : null);

export async function GET(req: Request) {
  const u = new URL(req.url);
  const address = (u.searchParams.get("address") ?? "").toLowerCase();
  const token = (u.searchParams.get("token") ?? "").toLowerCase();
  if (!isAddr(address)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if (token) {
    if (!isAddr(token)) return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    const h = await arcHolding(address as `0x${string}`, token as `0x${string}`);
    if (!h.meta || h.price == null) return NextResponse.json({ error: "No market for this token yet" }, { status: 404 });
    return NextResponse.json({ bag: { id: token, symbol: h.meta.symbol, name: h.meta.name || h.meta.symbol, logo: h.meta.logo, amount: h.amount, price: h.price, value: h.usd } });
  }

  try {
    const p = new URLSearchParams({ module: "account", action: "tokenlist", address });
    const r = await fetch(`https://explorer.arc.io/api?${p}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!r.ok) return NextResponse.json({ bags: [], manual: true });
    const j = (await r.json()) as { result?: { contractAddress?: string; balance?: string; decimals?: string; symbol?: string; name?: string; type?: string }[] };
    const cands = (Array.isArray(j.result) ? j.result : []).filter((t) => isAddr((t.contractAddress ?? "").toLowerCase()) && (!t.type || t.type === "ERC-20") && /^\d+$/.test(t.balance ?? "") && t.balance !== "0").slice(0, 20);
    const bags = (await Promise.all(cands.map(async (t) => {
      const a = (t.contractAddress ?? "").toLowerCase() as `0x${string}`;
      const h = await arcHolding(address as `0x${string}`, a).catch(() => null);
      if (!h?.meta || h.usd == null || h.usd < 1) return null;
      return { id: a, symbol: h.meta.symbol, name: h.meta.name || h.meta.symbol, logo: https(h.meta.logo), amount: h.amount, price: h.price, value: h.usd };
    }))).filter(Boolean).sort((a, b) => (b!.value ?? 0) - (a!.value ?? 0));
    return NextResponse.json({ bags, manual: bags.length === 0 });
  } catch { return NextResponse.json({ bags: [], manual: true }); }
}

/** GET /api/drc20?sort=holders|new|progress&q=… — tokens DRC-20 indexés (Dogecoin). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { drcPct, type Drc20Token } from "@/lib/drc20";

export const revalidate = 30;

type Market = { holders?: number | null; id: string; symbol: string; name: string; image: string | null; price: number | null; mcap: number | null; volume: number | null; change24h: number | null };

/** Relevé sur doggy.market (16 nov. 2026) pour les tokens que CoinGecko ne chiffre pas correctement (market cap à 0). Remplacé par l'indexer OM dès qu'il tourne. */
const DOGGY_SNAPSHOT: Record<string, { price: number; mcap: number; holders: number }> = {
  dosu: { price: 3.7e-10, mcap: 156_900, holders: 7_454 },
};

/** Tokens relevés sur doggy.market (16 nov. 2026) qui ne sont pas sur CoinGecko. */
const DOGGY_EXTRA: Market[] = [
  { id: "dbit", symbol: "DBIT", name: "dbit", image: null, price: 2.9e-11, mcap: 61_800, volume: null, change24h: null, holders: 7_343 },
];

/** Secours tant que l'indexer OM n'a rien lu : les DRC-20 listés sur CoinGecko (catégorie « drc-20 »). */
async function coingeckoDrc20(q: string): Promise<Market[]> {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=drc-20&order=market_cap_desc&per_page=100&page=1", {
      headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000), next: { revalidate: 300 },
    });
    if (!r.ok) return DOGGY_EXTRA.filter((c) => !q || c.symbol.toLowerCase().includes(q));
    const j = await r.json() as { id: string; symbol: string; name: string; image?: string; current_price?: number | null; market_cap?: number | null; total_volume?: number | null; price_change_percentage_24h?: number | null }[];
    const fromGecko: Market[] = j
      .map((c) => ({ holders: null as number | null, id: c.id, symbol: String(c.symbol).toUpperCase().slice(0, 12), name: String(c.name).slice(0, 40), image: c.image && /^https:\/\//.test(c.image) ? c.image : null,
        price: c.current_price ?? null, mcap: c.market_cap ?? null, volume: c.total_volume ?? null, change24h: c.price_change_percentage_24h ?? null }))
      .map((c) => { const d = DOGGY_SNAPSHOT[c.symbol.toLowerCase()]; return d && !(c.mcap && c.mcap > 0) ? { ...c, price: d.price, mcap: d.mcap, holders: d.holders } : c; })
      ;
    const have = new Set(fromGecko.map((c) => c.symbol.toLowerCase()));
    return [...fromGecko, ...DOGGY_EXTRA.filter((c) => !have.has(c.symbol.toLowerCase()))]
      .filter((c) => !q || c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .sort((a, b) => (b.mcap ?? 0) - (a.mcap ?? 0));
  } catch { return DOGGY_EXTRA.filter((c) => !q || c.symbol.toLowerCase().includes(q)); }
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const sort = u.searchParams.get("sort") ?? "holders";
  const q = (u.searchParams.get("q") ?? "").trim().toLowerCase().replace(/[^\p{L}\p{N}$._-]/gu, "").slice(0, 8);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    let qy = db.from("drc20_tokens").select("tick, max_supply, lim, dec, minted, holders, deployer, inscription, height").limit(200);
    if (q) qy = qy.ilike("tick", `%${q}%`);
    qy = sort === "new" ? qy.order("height", { ascending: false }) : qy.order("holders", { ascending: false });
    const [{ data, error }, st] = await Promise.all([qy, db.from("drc20_state").select("height, updated_at").eq("id", 1).maybeSingle()]);
    if (error) throw new Error(error.message);
    let tokens: Drc20Token[] = ((data ?? []) as Record<string, string | number>[]).map((r) => ({
      tick: String(r.tick), max: String(r.max_supply), lim: String(r.lim), dec: Number(r.dec), minted: String(r.minted), holders: Number(r.holders),
      deployer: String(r.deployer), inscription: String(r.inscription), height: Number(r.height), progress: drcPct(String(r.minted), String(r.max_supply)),
    }));
    if (sort === "progress") tokens = tokens.sort((a, b) => b.progress - a.progress);
    const market = tokens.length ? [] : await coingeckoDrc20(q);
    return NextResponse.json({ tokens, market, indexed: st?.data?.height ?? null, updated: st?.data?.updated_at ?? null }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch {
    return NextResponse.json({ tokens: [], market: await coingeckoDrc20(q), indexed: null, updated: null });
  }
}

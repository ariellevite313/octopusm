/**
 * Lecture seule des marchés Polymarket (API publique "Gamma").
 * Affichage uniquement : les ordres se passent sur polymarket.com.
 */

export type PmOutcome = { label: string; pct: number };
export type PmMarket = {
  id: string;
  slug: string;
  title: string;
  image: string | null;
  volume24h: number;
  endDate: string | null;
  live: boolean;
  outcomes: PmOutcome[];
  url: string;
};

const BASE = process.env.POLYMARKET_API_BASE || "https://gamma-api.polymarket.com";

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") { try { const j = JSON.parse(v); return Array.isArray(j) ? j.map(String) : []; } catch { return []; } }
  return [];
}
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapEvent(e: any): PmMarket | null {
  if (!e?.slug || !e?.title) return null;
  const markets: any[] = Array.isArray(e.markets) ? e.markets.filter((m: any) => m && !m.closed && m.active !== false) : [];
  if (markets.length === 0) return null;

  let outcomes: PmOutcome[] = [];
  if (markets.length === 1) {
    const labels = arr(markets[0].outcomes), prices = arr(markets[0].outcomePrices);
    outcomes = labels.map((label, i) => ({ label, pct: Math.round(num(prices[i]) * 100) }));
  } else {
    // Plusieurs sous-marchés (« qui va gagner ? ») : on garde les plus probables
    outcomes = markets
      .map((m) => ({ label: String(m.groupItemTitle || m.question || ""), pct: Math.round(num(arr(m.outcomePrices)[0]) * 100) }))
      .filter((o) => o.label)
      .sort((a, b) => b.pct - a.pct);
  }
  outcomes = outcomes.filter((o) => o.label).slice(0, 3);
  if (outcomes.length === 0) return null;

  return {
    id: String(e.id ?? e.slug),
    slug: String(e.slug),
    title: String(e.title),
    image: e.image || e.icon || null,
    volume24h: num(e.volume24hr),
    endDate: e.endDate ?? null,
    live: Boolean(e.live),
    outcomes,
    url: `https://polymarket.com/event/${encodeURIComponent(String(e.slug))}`,
  };
}

export async function fetchPolymarket(kind: "trending" | "sports", limit = 24): Promise<PmMarket[]> {
  const q = new URLSearchParams({
    active: "true", closed: "false", archived: "false",
    order: "volume24hr", ascending: "false", limit: String(limit),
  });
  if (kind === "sports") q.set("tag_slug", "sports");
  const res = await fetch(`${BASE}/events?${q}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`polymarket ${res.status}`);
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data.map(mapEvent).filter((m): m is PmMarket => m !== null);
}

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

// ── Page « Actualité Polymarket » ────────────────────────────────────────────

export type PmTag = { slug: string; label: string };
export type PmItem = { label: string; pct: number; image: string | null; volume: number };
export type PmEvent = PmMarket & {
  category: string | null;
  tags: PmTag[];
  featured: boolean;
  volume: number;
  items: PmItem[]; // toutes les issues triées (max 8)
};
export type PmTopic = { slug: string; label: string; volume: number };

const GENERIC_TAGS = new Set([
  "all", "featured", "hide-from-new", "recurring", "rewards-20-4pt5-3pt5-0pt5", "parent-for-derivative",
  "weekly", "daily", "monthly", "games", "crypto-prices", "up-or-down", "5m", "15m", "1h", "4h",
]);

export function mapEventRich(e: any): PmEvent | null {
  const base = mapEvent(e);
  if (!base) return null;
  const markets: any[] = (Array.isArray(e.markets) ? e.markets : []).filter((m: any) => m && !m.closed && m.active !== false);
  let items: PmItem[];
  if (markets.length === 1) {
    const labels = arr(markets[0].outcomes), prices = arr(markets[0].outcomePrices);
    items = labels.map((label, i) => ({ label, pct: Math.round(num(prices[i]) * 100), image: null, volume: num(markets[0].volume) }));
  } else {
    items = markets
      .map((m) => ({
        label: String(m.groupItemTitle || m.question || ""),
        pct: Math.round(num(arr(m.outcomePrices)[0]) * 100),
        image: (m.icon || m.image || null) as string | null,
        volume: num(m.volume),
      }))
      .filter((o) => o.label)
      .sort((a, b) => b.pct - a.pct);
  }
  const tags: PmTag[] = (Array.isArray(e.tags) ? e.tags : [])
    .filter((t: any) => t?.slug && t?.label)
    .map((t: any) => ({ slug: String(t.slug), label: String(t.label) }));
  const category = tags.find((t) => !GENERIC_TAGS.has(t.slug))?.label ?? null;
  return { ...base, category, tags, featured: Boolean(e.featured), volume: num(e.volume), items: items.slice(0, 8) };
}

async function gamma(q: URLSearchParams): Promise<any[]> {
  const res = await fetch(`${BASE}/events?${q}`, { headers: { Accept: "application/json" }, next: { revalidate: 60 }, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`polymarket ${res.status}`);
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? data : [];
}

export async function fetchPolymarketHome(tag?: string): Promise<{ featured: PmEvent[]; topics: PmTopic[]; categories: PmTag[]; markets: PmEvent[]; usMap: Record<string, PmStateLean> }> {
  const base = () => new URLSearchParams({ active: "true", closed: "false", archived: "false", order: "volume24hr", ascending: "false" });
  const topQ = base(); topQ.set("limit", "100");
  const [rawTop, usMap] = await Promise.all([gamma(topQ), fetchMidtermMap()]);
  const top = rawTop.map(mapEventRich).filter((m): m is PmEvent => m !== null);

  let featured = top.filter((e) => e.featured && e.items.length >= 2).slice(0, 8);
  if (featured.length < 3) featured = top.filter((e) => e.items.length >= 2).slice(0, 8);

  // Sujets d'actualité + catégories : agrégés par tag, classés par volume 24h
  const agg = new Map<string, PmTopic>();
  for (const e of top) for (const t of e.tags) {
    if (GENERIC_TAGS.has(t.slug)) continue;
    const cur = agg.get(t.slug) ?? { slug: t.slug, label: t.label, volume: 0 };
    cur.volume += e.volume24h; agg.set(t.slug, cur);
  }
  const ranked = [...agg.values()].sort((a, b) => b.volume - a.volume);
  const topics = ranked.slice(0, 8);
  const categories = ranked.slice(0, 16).map(({ slug, label }) => ({ slug, label }));

  let markets = top;
  if (tag) {
    const q = base(); q.set("limit", "60"); q.set("tag_slug", tag);
    markets = (await gamma(q)).map(mapEventRich).filter((m): m is PmEvent => m !== null);
  }
  return { featured, topics, categories, markets: markets.slice(0, 60), usMap };
}

// ── Carte des midterms (états → favori) ──────────────────────────────────────

export type PmStateLean = { dem: number; rep: number; title: string; url: string };

const STATE_NAMES: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY",
  Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO",
  Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI",
  "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA",
  Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};
const STATE_RE = new RegExp(`\\b(${Object.keys(STATE_NAMES).sort((a, b) => b.length - a.length).join("|")})\\b`);

export function mapStateLeans(events: any[]): Record<string, PmStateLean> {
  const best: Record<string, { vol: number; v: PmStateLean }> = {};
  for (const e of events) {
    const m = STATE_RE.exec(String(e?.title ?? ""));
    if (!m) continue;
    const code = STATE_NAMES[m[1]];
    const markets: any[] = (Array.isArray(e.markets) ? e.markets : []).filter((x: any) => x && !x.closed);
    let dem: number | null = null, rep: number | null = null;
    const price = (mk: any, idx = 0) => num(arr(mk.outcomePrices)[idx]);
    for (const mk of markets) {
      const labels = arr(mk.outcomes).map((x) => x.toLowerCase());
      const di = labels.findIndex((x) => x.startsWith("democrat")), ri = labels.findIndex((x) => x.startsWith("republican"));
      if (di >= 0) dem = price(mk, di);
      if (ri >= 0) rep = price(mk, ri);
      const name = `${mk.groupItemTitle ?? ""} ${mk.question ?? ""}`.toLowerCase();
      if (di < 0 && ri < 0) {
        if (/democrat/.test(name) && !/republican/.test(name)) dem = price(mk);
        else if (/republican/.test(name) && !/democrat/.test(name)) rep = price(mk);
      }
    }
    if (dem === null && rep === null) continue;
    const d = dem ?? 1 - (rep as number), r = rep ?? 1 - (dem as number);
    const vol = num(e.volume);
    if (!best[code] || vol > best[code].vol) {
      best[code] = { vol, v: { dem: d, rep: r, title: String(e.title), url: `https://polymarket.com/event/${encodeURIComponent(String(e.slug))}` } };
    }
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.v]));
}

export async function fetchMidtermMap(): Promise<Record<string, PmStateLean>> {
  try {
    const q = new URLSearchParams({ active: "true", closed: "false", archived: "false", order: "volume", ascending: "false", limit: "300", tag_slug: "midterms" });
    return mapStateLeans(await gamma(q));
  } catch { return {}; }
}

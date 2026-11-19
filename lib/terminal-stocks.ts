/**
 * Section « Stocks » du Terminal : actions et ETF tokenisés sur Solana, uniquement chez des émetteurs reconnus
 * (xStocks de Backed/Kraken, Ondo Global Markets, Backpack Securities). Source : Jupiter, qui marque ces tokens
 * (étiquettes « xstocks », « ondo », « backpack » et « verified ») : les copies qui reprennent le nom d'une entreprise
 * ne passent pas. Prix, capitalisation, liquidité et variation 24 h en direct, cache 60 s.
 */
import type { TerminalToken } from "@/lib/terminal";

export const STOCK_ISSUERS = { xstocks: "xStocks", ondo: "Ondo", backpack: "Backpack" } as const;
type Issuer = keyof typeof STOCK_ISSUERS;
const QUERIES: [string, Issuer][] = [["xStock", "xstocks"], ["Ondo Tokenized", "ondo"], ["Backpack Securities", "backpack"]];

type Jup = {
  id: string; name: string; symbol: string; icon?: string | null; usdPrice?: number | null; mcap?: number | null; fdv?: number | null;
  liquidity?: number | null; isVerified?: boolean | null; tags?: string[] | null; firstPool?: { id?: string; createdAt?: string } | null;
  stats24h?: { priceChange?: number | null; buyVolume?: number | null; sellVolume?: number | null } | null;
};

const cache = new Map<string, { at: number; v: TerminalToken[] }>();

async function search(q: string): Promise<Jup[]> {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (r.status === 429) { await new Promise((x) => setTimeout(x, 800)); continue; }
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j) ? (j as Jup[]) : [];
    } catch { return []; }
  }
  return [];
}

const issuerOf = (t: Jup): Issuer | null => {
  const tags = t.tags ?? [];
  return tags.includes("xstocks") ? "xstocks" : tags.includes("ondo") ? "ondo" : tags.includes("backpack") ? "backpack" : null;
};

function toToken(t: Jup, iss: Issuer): TerminalToken {
  const vol = (t.stats24h?.buyVolume ?? 0) + (t.stats24h?.sellVolume ?? 0);
  const pos = (n: number | null | undefined) => (n != null && Number.isFinite(n) && n > 0 ? n : null);
  return {
    mint: t.id, symbol: t.symbol.slice(0, 16),
    // Nom de l'entreprise sans la mention de l'émetteur (affichée à part)
    name: t.name.replace(/\s*\(Ondo Tokenized\+?\)|\s+Ondo Tokenized\+?|\s+xStock|\s+-\s+Backpack Securities/gi, "").slice(0, 40),
    logo: t.icon ?? null, price: pos(t.usdPrice), change24h: t.stats24h?.priceChange ?? null, volume24h: vol || null,
    mcap: pos(t.mcap) ?? pos(t.fdv), liquidity: pos(t.liquidity), pool: "", createdAt: t.firstPool?.createdAt ?? null,
    chain: "solana", verified: true, issuer: STOCK_ISSUERS[iss],
  };
}

/** Liste des actions tokenisées (q : recherche d'une entreprise ou d'un ticker) */
export async function stocksList(q = ""): Promise<TerminalToken[]> {
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const queries = q ? QUERIES.map(([w]) => `${q} ${w}`).concat([q]) : QUERIES.map(([w]) => w);
  const found = (await Promise.all(queries.map(search))).flat();
  const seen = new Set<string>();
  const out: TerminalToken[] = [];
  for (const t of found) {
    const iss = issuerOf(t);
    if (!iss || !t.isVerified || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(toToken(t, iss));
  }
  // Les plus liquides d'abord (prix plus fiables)
  out.sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0));
  const v = out.slice(0, 80);
  if (v.length) { cache.set(key, { at: Date.now(), v }); if (cache.size > 200) cache.delete(cache.keys().next().value as string); }
  return v;
}

/**
 * GET /api/feed/tokens : « Tokens en tendance » de la colonne de droite du fil (ordinateur).
 * Ordre : ClawdTrust, Solana, tokens boostés (Omero), puis le top 10 des tokens en tendance du marché par volume 24 h
 * (sans les lancements du launchpad OM). Cache 60 s.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { PAIR_QUOTES } from "@/lib/solana/quotes";
import { solToken, type TerminalToken } from "@/lib/terminal";
import { tokenHref } from "@/lib/token-boost";

export const dynamic = "force-dynamic";

export type FeedToken = {
  chain: string; mint: string; symbol: string; name: string; logo: string | null;
  price: number | null; change24h: number | null; mcap: number | null; volume24h: number | null;
  href: string; tag: "pinned" | "boosted" | "new" | "trending";
};

let cache: { at: number; v: FeedToken[] } | null = null;

const fromTerminal = (t: TerminalToken, tag: FeedToken["tag"], om = false): FeedToken => ({
  chain: t.chain ?? "solana", mint: t.mint, symbol: t.symbol, name: t.name, logo: t.logo,
  price: t.price, change24h: t.change24h, mcap: t.mcap, volume24h: t.volume24h,
  href: t.href ?? tokenHref({ chain: t.chain ?? "solana", mint: t.mint, om }), tag,
});

type Lp = { name: string; ticker: string; logo_url: string | null; mint_address: string | null; chain: string | null; status: string; market_cap_usd: number | null; volume_24h_usd: number | null; price_usd: number | null; created_at: string; is_hidden?: boolean | null };
const fromLaunch = (t: Lp, tag: FeedToken["tag"]): FeedToken => ({
  chain: t.chain ?? "solana", mint: t.mint_address!, symbol: t.ticker, name: t.name, logo: t.logo_url,
  price: t.price_usd, change24h: null, mcap: t.market_cap_usd, volume24h: t.volume_24h_usd,
  href: tokenHref({ chain: t.chain ?? "solana", mint: t.mint_address!, om: true }), tag,
});

async function build(origin: string): Promise<FeedToken[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const [terminal, sol, boosts, launches] = await Promise.all([
    fetch(`${origin}/api/terminal?list=trending&chains=solana`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { tokens: [] })).then((j: { tokens?: TerminalToken[] }) => j.tokens ?? []).catch(() => [] as TerminalToken[]),
    solToken().catch(() => null),
    db.from("token_boosts").select("chain, mint, symbol, name, logo, boosted_until").gt("boosted_until", new Date().toISOString()).order("updated_at", { ascending: false }).limit(10)
      .then((r: { data: unknown }) => (r.data ?? []) as { chain: string; mint: string; symbol: string; name: string; logo: string | null }[], () => []),
    db.from("launchpad_tokens").select("name, ticker, logo_url, mint_address, chain, status, market_cap_usd, volume_24h_usd, price_usd, created_at, is_hidden")
      .in("status", ["active", "graduating", "graduated"]).not("mint_address", "is", null).order("created_at", { ascending: false }).limit(1000)
      .then((r: { data: unknown }) => ((r.data ?? []) as Lp[]).filter((t) => !t.is_hidden), () => [] as Lp[]),
  ]);

  const out: FeedToken[] = [];
  const seen = new Set<string>();
  const add = (t: FeedToken) => { const k = `${t.chain}:${t.mint}`; if (seen.has(k) || !t.mint) return; seen.add(k); out.push(t); };

  // 1. ClawdTrust, 2. Solana
  const cltMint = PAIR_QUOTES.clt.mint;
  const clt = terminal.find((t: TerminalToken) => t.mint === cltMint);
  add(clt ? fromTerminal({ ...clt, logo: PAIR_QUOTES.clt.logo }, "pinned")
    : { chain: "solana", mint: cltMint, symbol: "CLT", name: "ClawdTrust", logo: PAIR_QUOTES.clt.logo, price: null, change24h: null, mcap: null, volume24h: null, href: tokenHref({ chain: "solana", mint: cltMint }), tag: "pinned" });
  if (sol) add(fromTerminal(sol, "pinned"));

  // 3. Tokens boostés en Omero (dernier boost en premier), avec les chiffres du marché quand on les a
  const market = new Map<string, TerminalToken>(terminal.map((t: TerminalToken) => [`${t.chain ?? "solana"}:${t.mint}`, t]));
  const lpBy = new Map<string, Lp>(launches.map((t: Lp) => [`${t.chain ?? "solana"}:${t.mint_address}`, t]));
  for (const b of boosts) {
    const k = `${b.chain}:${b.mint}`, m = market.get(k), lp = lpBy.get(k);
    if (lp) { add({ ...fromLaunch(lp, "boosted"), logo: lp.logo_url ?? b.logo }); continue; }
    add({ chain: b.chain, mint: b.mint, symbol: b.symbol, name: b.name, logo: m?.logo ?? b.logo, price: m?.price ?? null, change24h: m?.change24h ?? null, mcap: m?.mcap ?? null, volume24h: m?.volume24h ?? null, href: tokenHref({ chain: b.chain, mint: b.mint }), tag: "boosted" });
  }

  // 4. Top 10 des tokens en tendance du marché, classés par volume 24 h (pas les lancements du launchpad OM)
  const omMints = new Set(launches.map((t: Lp) => `${t.chain ?? "solana"}:${t.mint_address}`));
  const top = terminal
    .filter((t: TerminalToken) => !t.soon && !t.href && (t.volume24h ?? 0) > 0 && !omMints.has(`${t.chain ?? "solana"}:${t.mint}`))
    .sort((a: TerminalToken, b: TerminalToken) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
  let n = 0;
  for (const t of top) { if (n >= 10) break; const before = out.length; add(fromTerminal(t, "trending")); if (out.length > before) n++; }
  return out;
}

export async function GET(req: Request) {
  if (!cache || Date.now() - cache.at > 60_000) {
    const v = await build(new URL(req.url).origin).catch(() => null);
    if (v?.length) cache = { at: Date.now(), v };
  }
  return NextResponse.json({ tokens: cache?.v ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

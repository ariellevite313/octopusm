/**
 * GET /api/feed/tokens : « Tokens en tendance » de la colonne de droite du fil (ordinateur).
 * Ordre : ClawdTrust, Solana, tokens boostés (Omero), derniers lancements OM, puis les tokens avec le plus
 * de volume et d'engagement sur OM (posts, likes, réponses des dernières 24 h). Cache 60 s.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { PAIR_QUOTES } from "@/lib/solana/quotes";
import { solToken, type TerminalToken } from "@/lib/terminal";
import { tokenHref, trendScore } from "@/lib/token-boost";

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
  const since = new Date(Date.now() - 86400_000).toISOString();
  const [terminal, sol, boosts, launches, posts] = await Promise.all([
    fetch(`${origin}/api/terminal?list=trending&chains=solana`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { tokens: [] })).then((j: { tokens?: TerminalToken[] }) => j.tokens ?? []).catch(() => [] as TerminalToken[]),
    solToken().catch(() => null),
    db.from("token_boosts").select("chain, mint, symbol, name, logo, boosted_until").gt("boosted_until", new Date().toISOString()).order("updated_at", { ascending: false }).limit(10)
      .then((r: { data: unknown }) => (r.data ?? []) as { chain: string; mint: string; symbol: string; name: string; logo: string | null }[], () => []),
    db.from("launchpad_tokens").select("name, ticker, logo_url, mint_address, chain, status, market_cap_usd, volume_24h_usd, price_usd, created_at, is_hidden")
      .in("status", ["active", "graduating", "graduated"]).not("mint_address", "is", null).order("created_at", { ascending: false }).limit(60)
      .then((r: { data: unknown }) => ((r.data ?? []) as Lp[]).filter((t) => !t.is_hidden), () => [] as Lp[]),
    db.from("posts").select("token_id, bag_mint, bag_chain, like_count, reply_count").eq("hidden", false).gte("created_at", since).limit(2000)
      .then((r: { data: unknown }) => (r.data ?? []) as { token_id: string | null; bag_mint: string | null; bag_chain: string | null; like_count: number; reply_count: number }[], () => []),
  ]);

  // Engagement sur OM par token (posts « Chill ton sac » et posts liés à un lancement OM)
  const engage = new Map<string, number>();
  const tokenIds = [...new Set(posts.map((p: { token_id: string | null }) => p.token_id).filter(Boolean))] as string[];
  const idToMint = new Map<string, string>();
  if (tokenIds.length) {
    const { data } = await db.from("launchpad_tokens").select("id, mint_address, chain").in("id", tokenIds).then((r: unknown) => r, () => ({ data: [] }));
    for (const t of (data ?? []) as { id: string; mint_address: string | null; chain: string | null }[]) if (t.mint_address) idToMint.set(t.id, `${t.chain ?? "solana"}:${t.mint_address}`);
  }
  for (const p of posts as { token_id: string | null; bag_mint: string | null; bag_chain: string | null; like_count: number; reply_count: number }[]) {
    const key = p.bag_mint ? `${p.bag_chain ?? "solana"}:${p.bag_mint}` : p.token_id ? idToMint.get(p.token_id) : null;
    if (key) engage.set(key, (engage.get(key) ?? 0) + 1 + (p.like_count ?? 0) + 2 * (p.reply_count ?? 0));
  }

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

  // 4. Les 3 derniers lancements sur OM
  for (const t of launches.slice(0, 3)) add(fromLaunch(t, "new"));

  // 5. Tendances : volume 24 h et engagement sur OM
  const pool: FeedToken[] = [
    ...terminal.filter((t: TerminalToken) => !t.soon).map((t: TerminalToken) => fromTerminal(t, "trending")),
    ...launches.map((t: Lp) => fromLaunch(t, "trending")),
  ];
  pool.sort((a, b) => trendScore(b.volume24h, engage.get(`${b.chain}:${b.mint}`) ?? 0) - trendScore(a.volume24h, engage.get(`${a.chain}:${a.mint}`) ?? 0));
  for (const t of pool) { if (out.length >= 15) break; add(t); }
  return out;
}

export async function GET(req: Request) {
  if (!cache || Date.now() - cache.at > 60_000) {
    const v = await build(new URL(req.url).origin).catch(() => null);
    if (v?.length) cache = { at: Date.now(), v };
  }
  return NextResponse.json({ tokens: cache?.v ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

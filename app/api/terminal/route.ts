/**
 * GET /api/terminal?list=trending|new|volume|crypto  ou  ?q=…  &chains=solana,base (absent ou « all » : tous les réseaux)
 * (ou &chain=… pour un seul réseau). Tokens pour le Terminal OM.
 */
import { PAIR_QUOTES } from "@/lib/solana/quotes";
import { DOGE_MINT } from "@/lib/solana/doge";
import { stocksList } from "@/lib/terminal-stocks";
import { NextResponse } from "next/server";
import { arcList, dsolList, pairList, solToken, OMERO_SOON, CHAINS, isSkipped, mergeLists, searchAll, terminalList, type TerminalChain, type TerminalToken } from "@/lib/terminal";
import { jupVerified } from "@/lib/bags";
import { cryptoFromCoinGecko } from "@/lib/terminal-crypto";
import { arcMarket, dexList, dexSearch, enrichDex } from "@/lib/dexscreener";
import { isMajorEvm, isMajorSolana } from "@/lib/swap/majors";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const READY = CHAINS.filter((c) => c.ready).map((c) => c.id);

/** Tête des listes Solana (Tendances, Crypto, Volume) : ClawdTrust, SOL, puis PEPE et DOGE (cache 60 s).
 *  Omero, pas encore lancé, est ajouté en 3e position après les filtres. */
let pinnedCache: { at: number; v: TerminalToken[] } | null = null;
async function pinnedPairs(): Promise<TerminalToken[]> {
  if (pinnedCache && Date.now() - pinnedCache.at < 60_000) return pinnedCache.v;
  const out: TerminalToken[] = [];
  const clt = PAIR_QUOTES.clt.mint;
  const c = (await dexSearch(clt, ["solana"]).catch(() => [] as TerminalToken[])).find((x) => x.mint === clt);
  out.push(c ? { ...c, verified: true, logo: PAIR_QUOTES.clt.logo }
    : { mint: clt, symbol: "CLT", name: "ClawdTrust", logo: PAIR_QUOTES.clt.logo, price: null, change24h: null, volume24h: null, mcap: null, liquidity: null, pool: "", createdAt: null, chain: "solana", verified: true });
  const sol = await solToken().catch(() => null);
  if (sol) out.push(sol);
  for (const k of ["pepe", "doge"] as const) {
    const mint = PAIR_QUOTES[k].mint;
    const found = await dexSearch(mint, ["solana"]).catch(() => [] as TerminalToken[]);
    const t = found.find((x) => x.mint === mint);
    // Logos d'OM pour les deux paires (DOGE de Solana et PEPE), quel que soit celui de DexScreener
    if (t) out.push({ ...t, verified: true, logo: PAIR_QUOTES[k].logo });
  }
  if (out.length) pinnedCache = { at: Date.now(), v: out };
  return out;
}

/** Monnaie de paire des tokens lancés sur OM (DOGE, PEPE, ClawdTrust) : leur pastille remplace celle de Solana partout dans le Terminal */
const BADGE_OF: Record<string, string> = { [DOGE_MINT]: "/chains/dogecoin.png", [PAIR_QUOTES.pepe.mint]: "/pepe.png", [PAIR_QUOTES.clt.mint]: "/clawdtrust-coin.png" };
async function pairBadges(tokens: TerminalToken[]) {
  const mints = tokens.filter((t) => (t.chain ?? "solana") === "solana" && !t.badge).map((t) => t.mint);
  if (!mints.length) return;
  try {
    const { data } = await (createAdminClient() as unknown as { from: (t: string) => { select: (c: string) => { in: (k: string, v: string[]) => { in: (k: string, v: string[]) => Promise<{ data: { mint_address: string; quote_asset: string }[] | null }> } } } })
      .from("launchpad_tokens").select("mint_address, quote_asset").in("mint_address", mints).in("quote_asset", Object.keys(BADGE_OF));
    const by = new Map((data ?? []).map((r) => [r.mint_address, BADGE_OF[r.quote_asset]]));
    for (const t of tokens) { const b = by.get(t.mint); if (b) t.badge = b; }
  } catch { /* pastille de Solana par défaut */ }
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 60);
  const l = u.searchParams.get("list");
  const list = l === "new" ? "new" : l === "volume" ? "volume" : l === "crypto" ? "crypto" : "trending";
  const raw = (u.searchParams.get("chains") ?? u.searchParams.get("chain") ?? "all").split(",").map((s) => s.trim());
  let chains = raw.filter((c): c is TerminalChain => READY.includes(c as TerminalChain));
  if (!chains.length) chains = READY;
  // DSOL-20 : tokens lancés sur OM en paire DOGE (Solana), liste à part
  // PSOL-20 (paire PEPE) et CLT-20 (paire ClawdTrust)
  if (l === "psol20" || l === "clt20") {
    const tokens = await pairList(createAdminClient(), PAIR_QUOTES[l === "psol20" ? "pepe" : "clt"].mint, q, l === "psol20" ? "/pepe.png" : "/clawdtrust-coin.png").catch(() => [] as TerminalToken[]);
    return NextResponse.json({ tokens }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=30" } });
  }
  // Stocks : actions et ETF tokenisés (xStocks, Ondo, Backpack), Solana
  if (l === "stocks") {
    const tokens = await stocksList(q).catch(() => [] as TerminalToken[]);
    return NextResponse.json({ tokens }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=20, stale-while-revalidate=60" } });
  }
  if (l === "dsol20") {
    const tokens = await dsolList(createAdminClient(), q).catch(() => [] as TerminalToken[]);
    return NextResponse.json({ tokens }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=30" } });
  }
  const kind = q.length >= 2 ? "search" : list;
  // Crypto : classement CoinGecko (prix Binance), puis repli sur les pools GeckoTerminal si CoinGecko ne répond pas
  let cgList: TerminalToken[] = [];
  if (kind === "crypto") cgList = await cryptoFromCoinGecko(chains.filter((c) => c !== "arc"), isSkipped).catch(() => []);
  const geckoChains = chains.filter((c) => c !== "arc");
  const arcPromise = chains.includes("arc") ? arcList(createAdminClient(), kind, q).catch(() => [] as TerminalToken[]) : Promise.resolve([] as TerminalToken[]);
  // DexScreener : tokens boostés (tendances), nouveaux profils, recherche multi-réseaux. Une panne de cette source ne casse rien.
  const dexPromise: Promise<TerminalToken[]> = kind === "trending" || kind === "new" ? dexList(kind, chains).catch(() => [])
    : kind === "search" ? dexSearch(q, chains).catch(() => []) : Promise.resolve([]);
  // Arc : tokens cotés sur Uniswap (TOLLY, ARGUS, BTC/ETH sur Arc…), en plus des lancements OM
  const arcDexPromise: Promise<TerminalToken[]> = chains.includes("arc") && kind !== "search" ? arcMarket(kind).catch(() => []) : Promise.resolve([]);
  const geckoPromise: Promise<TerminalToken[][]> = cgList.length ? Promise.resolve([cgList])
    : kind === "search" && geckoChains.length > 1 ? searchAll(q, geckoChains).catch(() => [] as TerminalToken[]).then((x) => [x])
    : Promise.all(geckoChains.map(async (chain): Promise<TerminalToken[]> => {
        try { return await terminalList(kind, q, chain); } catch { return []; }
      }));
  const [gecko, arc, dex, arcDex] = await Promise.all([geckoPromise, arcPromise, dexPromise, arcDexPromise]);
  // Arc d'abord pour les recherches ciblées ; DexScreener en dernier (complète GeckoTerminal sans le remplacer)
  const merged = mergeLists([...gecko, arc, arcDex, dex], kind, 120);
  const pinned = chains.includes("solana") && (kind === "trending" || kind === "crypto" || kind === "volume") && !["dex", "social", "site"].some((k) => u.searchParams.get(k));
  if (pinned) {
    const pins = await pinnedPairs();
    if (pins.length) { const pm = new Set(pins.map((p) => p.mint)); merged.splice(0, merged.length, ...pins, ...merged.filter((t) => !pm.has(t.mint))); }
  }
  await enrichDex(merged).catch(() => {});
  // Filtres : profil DexScreener payé, réseaux sociaux, site web
  const f = u.searchParams;
  const tokens = merged
    .filter((t) => f.get("dex") !== "paid" || t.dex?.paid)
    .filter((t) => f.get("social") !== "1" || (t.dex?.socials.length ?? 0) > 0)
    .filter((t) => f.get("site") !== "1" || !!t.dex?.website)
    .slice(0, 60);
  // Pastille : tokens vérifiés sur Jupiter (Solana), majeurs, ou lancés sur OM (Arc)
  const sol = tokens.filter((t) => (t.chain ?? "solana") === "solana" && !t.href);
  const ver = await jupVerified(sol.map((t) => t.mint)).catch(() => new Set<string>());
  for (const t of tokens) t.verified = t.verified || t.href ? true : (t.chain ?? "solana") === "solana" ? ver.has(t.mint) || isMajorSolana(t.mint) : isMajorEvm(t.chain ?? "", t.mint);
  await pairBadges(tokens);
  // Omero (pas encore lancé) juste après ClawdTrust et SOL dans les listes Solana
  if (pinned) tokens.splice(Math.min(2, tokens.length), 0, OMERO_SOON);
  return NextResponse.json({ tokens }, { status: tokens.length || chains.length === 0 ? 200 : 200, headers: { "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=30" } });
}

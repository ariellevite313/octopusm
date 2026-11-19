/**
 * Pools automatiques sur les tokens du Terminal : « $TOKEN atteindra X (environ ×10) de capitalisation avant … (7 jours) ? » (Oui / Non),
 * avec le logo du token en image. Un seul pool automatique ouvert par token.
 *  - Objectif atteint avant la date : clôture, résolution Oui, puis un nouveau pool au palier suivant.
 *  - Date passée sans l'atteindre : clôture, résolution Non, puis un nouveau pool depuis la capitalisation actuelle.
 * Créés sans frais par le compte de la plateforme (aucune revue : le texte est généré par OM).
 */
import { createPoolMarket } from "@/lib/market/create-pool";
import { resolvePool } from "@/lib/market/pool-resolve";
import { SWAP_FEE_WALLET } from "@/lib/swap/core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
/** Seuils pour qu'un token ait un pool automatique (évite les tokens morts ou manipulables trop facilement) */
const MIN_MCAP = 10_000, MIN_LIQ = 3_000;
/** Une semaine : un ×10 en 24 h serait presque toujours « Non » */
const DURATION_MS = 7 * 24 * 3_600_000;
const DS: Record<string, string> = { solana: "solana", base: "base", bnb: "bsc", ethereum: "ethereum", arbitrum: "arbitrum", polygon: "polygon", avalanche: "avalanche", hyperliquid: "hyperevm" };
const creator = () => process.env.TOKEN_POOL_CREATOR_WALLET || SWAP_FEE_WALLET;

export type TokenMarket = { mcap: number | null; liquidity: number | null; symbol: string | null; logo: string | null };

/** Capitalisation, liquidité, symbole et logo (DexScreener ; tokens OM d'Arc : la base). */
export async function tokenMarket(db: Db, chain: string, mint: string): Promise<TokenMarket> {
  if (chain === "arc") {
    const { data } = await db.from("launchpad_tokens").select("ticker, logo_url, market_cap_usd").ilike("mint_address", mint).maybeSingle();
    return { mcap: data?.market_cap_usd != null ? Number(data.market_cap_usd) : null, liquidity: null, symbol: data?.ticker ?? null, logo: data?.logo_url ?? null };
  }
  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/${DS[chain] ?? chain}/${mint}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    const pairs = (r.ok ? await r.json() : []) as { baseToken?: { address?: string; symbol?: string }; marketCap?: number; fdv?: number; liquidity?: { usd?: number }; info?: { imageUrl?: string } }[];
    const own = pairs.filter((p) => (p.baseToken?.address ?? "").toLowerCase() === mint.toLowerCase());
    if (!own.length) return { mcap: null, liquidity: null, symbol: null, logo: null };
    const best = own.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    return {
      mcap: best.marketCap ?? best.fdv ?? null, liquidity: own.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0),
      symbol: best.baseToken?.symbol ?? null, logo: best.info?.imageUrl ?? null,
    };
  } catch { return { mcap: null, liquidity: null, symbol: null, logo: null }; }
}

/** Cible : environ 10 fois la capitalisation, arrondie au chiffre rond supérieur (1, 2 ou 5 × 10^n). 10 K$ → 100 K$, 70 K$ → 1 M$. */
export function nextTarget(mcap: number): number {
  const x = mcap * 10;
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  return (m <= 1.0001 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

export const money = (n: number) => (n >= 1e9 ? `$${+(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${+(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`);

/** Crée le pool automatique d'un token s'il n'en a pas d'ouvert. Retourne l'id du pool, ou null. */
export async function ensureTokenPool(db: Db, chain: string, mint: string, level = 1, known?: TokenMarket): Promise<string | null> {
  const { data: open, error } = await db.from("mutuel_markets").select("id").eq("token_mint", mint).not("auto_target", "is", null).in("status", ["active", "closed"]).limit(1);
  if (error) return null; // migration pas encore passée
  if (open?.length) return open[0].id;
  const m = known ?? await tokenMarket(db, chain, mint);
  if (!m.mcap || m.mcap < MIN_MCAP || (chain !== "arc" && (m.liquidity ?? 0) < MIN_LIQ)) return null;
  const sym = (m.symbol ?? "TOKEN").replace(/^\$/, "").slice(0, 16);
  const target = nextTarget(m.mcap);
  const closes = new Date(Date.now() + DURATION_MS);
  const when = closes.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
  const res = await createPoolMarket(creator(), {
    title: `Will $${sym} reach ${money(target)} market cap before ${when}?`,
    description: `Resolves Yes as soon as the market cap of $${sym} reaches ${money(target)} (DexScreener, checked every minute) before ${when}. Otherwise No. Token: ${mint}. Created automatically by OMdotfun: when it resolves, a new level is proposed.`,
    cover_image_src: m.logo,
    options: [{ label: "Yes" }, { label: "No" }],
    category: "crypto", bet_token: "usdc", creation_fee_token: "usdc",
    betting_closes_at: closes.toISOString(), token_mint: mint,
  }, { mandateId: "token-auto" });
  if (res.status !== 201) return null;
  const row = (await res.json()) as { id?: string };
  if (!row.id) return null;
  await db.from("mutuel_markets").update({ token_chain: chain, auto_target: target, auto_level: level }).eq("id", row.id);
  return row.id;
}

/** Plusieurs tokens d'un réseau en un appel DexScreener (30 par appel). */
async function marketsBatch(chain: string, mints: string[]): Promise<Map<string, TokenMarket>> {
  const out = new Map<string, TokenMarket>();
  for (let i = 0; i < mints.length; i += 30) {
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/${DS[chain] ?? chain}/${mints.slice(i, i + 30).join(",")}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      const pairs = (r.ok ? await r.json() : []) as { baseToken?: { address?: string; symbol?: string }; marketCap?: number; fdv?: number; liquidity?: { usd?: number }; info?: { imageUrl?: string } }[];
      for (const p of pairs) {
        const k = (p.baseToken?.address ?? "").toLowerCase(); if (!k) continue;
        const cur = out.get(k);
        if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity ?? 0)) out.set(k, { mcap: p.marketCap ?? p.fdv ?? null, liquidity: p.liquidity?.usd ?? null, symbol: p.baseToken?.symbol ?? null, logo: p.info?.imageUrl ?? null });
      }
    } catch { /* prochaine minute */ }
  }
  return out;
}

/** Passage du cron : résout les pools automatiques (objectif atteint ou date passée) et ouvre le suivant. */
export async function runTokenPools(db: Db, deadline: number): Promise<{ resolved: number; created: number }> {
  const { data, error } = await db.from("mutuel_markets").select("id, token_mint, token_chain, auto_target, auto_level, betting_closes_at, status").not("auto_target", "is", null).in("status", ["active", "closed"]).limit(300);
  if (error || !data?.length) return { resolved: 0, created: 0 };
  const rows = data as { id: string; token_mint: string; token_chain: string | null; auto_target: number; auto_level: number | null; betting_closes_at: string; status: string }[];
  // Capitalisations groupées par réseau (Arc : la base)
  const prices = new Map<string, TokenMarket>();
  const byChain = new Map<string, string[]>();
  for (const p of rows) { const c = p.token_chain ?? "solana"; if (c !== "arc") byChain.set(c, [...(byChain.get(c) ?? []), p.token_mint]); }
  for (const [c, mints] of byChain) for (const [k, v] of await marketsBatch(c, [...new Set(mints)])) prices.set(`${c}:${k}`, v);
  let resolved = 0, created = 0;
  for (const p of rows) {
    if (Date.now() > deadline) break;
    const chain = p.token_chain ?? "solana";
    const m = chain === "arc" ? await tokenMarket(db, chain, p.token_mint) : prices.get(`${chain}:${p.token_mint.toLowerCase()}`) ?? { mcap: null, liquidity: null, symbol: null, logo: null };
    const reached = m.mcap != null && m.mcap >= Number(p.auto_target);
    const expired = Date.now() >= Date.parse(p.betting_closes_at);
    if (!reached && !expired) continue;
    // Clôture (verrou : un seul passage la fait), puis résolution Oui (opt_0) ou Non (opt_1)
    await db.from("mutuel_markets").update({ status: "closed" }).eq("id", p.id).eq("status", "active");
    const r = await resolvePool(db, p.id, reached ? "opt_0" : "opt_1", creator());
    if (r.status !== 200) continue;
    resolved++;
    // Palier suivant si atteint, sinon on repart de la capitalisation actuelle
    if (await ensureTokenPool(db, chain, p.token_mint, reached ? (p.auto_level ?? 1) + 1 : 1, m)) created++;
  }
  return { resolved, created };
}

/** Ouvre un pool automatique pour les tokens lancés sur OM (Solana) assez gros qui n'en ont pas. */
export async function seedOmTokenPools(db: Db, deadline: number): Promise<number> {
  const { data } = await db.from("launchpad_tokens").select("mint_address, chain, market_cap_usd").in("status", ["active", "graduating", "graduated"]).not("mint_address", "is", null).gte("market_cap_usd", MIN_MCAP).limit(50);
  let n = 0;
  for (const t of (data ?? []) as { mint_address: string; chain: string | null }[]) {
    if (Date.now() > deadline) break;
    if (await ensureTokenPool(db, t.chain === "arc" ? "arc" : "solana", t.mint_address)) n++;
  }
  return n;
}

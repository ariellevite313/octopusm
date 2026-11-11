/**
 * BAGS : tout ce que le portefeuille connecté détient, sur sa chaîne (Solana ou Arc), trié par valeur.
 * Lecture seule : aucune signature, aucune transaction.
 *
 * Solana : SOL + tous les comptes token (SPL et Token-2022) lus sur le RPC, noms / logos / prix via Jupiter,
 *          les tokens OM gardent le nom, le logo et le prix de notre base.
 * Arc    : USDC natif + tokens lancés sur OM (table arc_holdings, mise à jour par le cron).
 */
import { PublicKey } from "@solana/web3.js";
import { createPublicClient, http } from "viem";
import { solanaConnection } from "@/lib/solana/rpc";

export type Bag = {
  chain: "solana" | "arc";
  /** mint Solana, adresse du contrat Arc, ou "native" */
  id: string;
  symbol: string;
  name: string;
  logo: string | null;
  amount: number;
  price: number | null;
  value: number | null;
  /** variation du prix sur 24 h, en % (null si inconnue) */
  change24h?: number | null;
  /** page OM du token s'il a été lancé chez nous */
  href: string | null;
};

/** Valeur sous laquelle un token est replié (poussière, spam, sans prix). */
export const BAGS_DUST_USD = 0.01;

/** Tri : valeur décroissante ; les tokens sans prix à la fin, par quantité. */
export function sortBags(list: Bag[]): Bag[] {
  return [...list].sort((a, b) => {
    const va = a.value ?? -1, vb = b.value ?? -1;
    if (va !== vb) return vb - va;
    return b.amount - a.amount;
  });
}

export function splitBags(list: Bag[]): { main: Bag[]; small: Bag[]; total: number; change24h: number } {
  const sorted = sortBags(list.filter((b) => b.amount > 0));
  const main = sorted.filter((b) => (b.value ?? 0) >= BAGS_DUST_USD);
  const small = sorted.filter((b) => (b.value ?? 0) < BAGS_DUST_USD);
  const total = main.reduce((s, b) => s + (b.value ?? 0), 0);
  // Gain ou perte en $ sur 24 h : valeur actuelle moins valeur d'il y a 24 h
  const change24h = main.reduce((s, b) => {
    const c = b.change24h;
    return c != null && Number.isFinite(c) && c > -100 && b.value != null ? s + b.value - b.value / (1 + c / 100) : s;
  }, 0);
  return { main, small, total, change24h };
}

const SOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];

type OmToken = { id: string; name: string; ticker: string; logo_url: string | null; price_usd: number | null; mint_address: string | null };
export type JupToken = { id: string; name?: string; symbol?: string; icon?: string | null; usdPrice?: number | null; isVerified?: boolean | null; stats24h?: { priceChange?: number | null } | null };

export async function jupTokens(mints: string[]): Promise<Map<string, JupToken>> {
  const out = new Map<string, JupToken>();
  const key = process.env.JUP_API_KEY;
  const base = key ? "https://api.jup.ag" : "https://lite-api.jup.ag";
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100);
    try {
      const r = await fetch(`${base}/tokens/v2/search?query=${chunk.join(",")}`, { headers: key ? { "x-api-key": key } : undefined, signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      for (const t of (await r.json()) as JupToken[]) if (t?.id) out.set(t.id, t);
    } catch { /* indisponible : on garde ce qu'on a */ }
  }
  // Secours pour ce que Jupiter n'a pas donné : DexScreener (30 adresses par appel, pool le plus liquide)
  const missing = mints.filter((m) => out.get(m)?.usdPrice == null);
  for (let i = 0; i < missing.length && i < 300; i += 30) {
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${missing.slice(i, i + 30).join(",")}`, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const pairs = (await r.json()) as { baseToken?: { address: string; name?: string; symbol?: string }; priceUsd?: string; priceChange?: { h24?: number }; liquidity?: { usd?: number }; info?: { imageUrl?: string } }[];
      const best = new Map<string, (typeof pairs)[number]>();
      for (const p of pairs ?? []) {
        const a = p.baseToken?.address;
        if (!a || !p.priceUsd || (p.liquidity?.usd ?? 0) < 1000) continue;
        if ((best.get(a)?.liquidity?.usd ?? -1) < (p.liquidity?.usd ?? 0)) best.set(a, p);
      }
      for (const [a, p] of best) {
        const prev = out.get(a);
        out.set(a, { id: a, name: prev?.name ?? p.baseToken?.name, symbol: prev?.symbol ?? p.baseToken?.symbol, icon: prev?.icon ?? p.info?.imageUrl ?? null, usdPrice: Number(p.priceUsd) || null, stats24h: { priceChange: p.priceChange?.h24 ?? null } });
      }
    } catch { /* rien */ }
  }
  return out;
}

const safeImg = (u: string | null | undefined) => (u && (/^https:\/\//i.test(u) || /^\/(?!\/)/.test(u)) ? u : null);

export async function solanaBags(wallet: string, omByMint: (mints: string[]) => Promise<OmToken[]>): Promise<Bag[]> {
  const conn = solanaConnection();
  const owner = new PublicKey(wallet);
  const [lamports, ...accLists] = await Promise.all([
    conn.getBalance(owner),
    ...TOKEN_PROGRAMS.map((p) => conn.getParsedTokenAccountsByOwner(owner, { programId: new PublicKey(p) }).catch(() => ({ value: [] }))),
  ]);

  const amounts = new Map<string, number>();
  for (const list of accLists) {
    for (const a of list.value) {
      const info = (a.account.data as { parsed?: { info?: { mint?: string; tokenAmount?: { uiAmountString?: string } } } }).parsed?.info;
      const mint = info?.mint;
      const n = Number(info?.tokenAmount?.uiAmountString ?? 0);
      if (mint && n > 0) amounts.set(mint, (amounts.get(mint) ?? 0) + n);
    }
  }
  const mints = [...amounts.keys()];
  const [jup, om] = await Promise.all([jupTokens([SOL_MINT, ...mints]), mints.length ? omByMint(mints) : Promise.resolve([])]);
  const omMap = new Map(om.filter((t) => t.mint_address).map((t) => [t.mint_address as string, t]));

  const bags: Bag[] = [];
  const sol = lamports / 1e9;
  if (sol > 0) {
    const p = jup.get(SOL_MINT)?.usdPrice ?? null;
    bags.push({ chain: "solana", id: "native", symbol: "SOL", name: "Solana", logo: "/solana.png", amount: sol, price: p, value: p != null ? p * sol : null, change24h: jup.get(SOL_MINT)?.stats24h?.priceChange ?? null, href: null });
  }
  for (const [mint, amount] of amounts) {
    const j = jup.get(mint), o = omMap.get(mint);
    const price = j?.usdPrice ?? (o?.price_usd != null ? Number(o.price_usd) : null);
    bags.push({
      chain: "solana", id: mint,
      symbol: (o?.ticker ?? j?.symbol ?? mint.slice(0, 4)).slice(0, 16),
      name: (o?.name ?? j?.name ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`).slice(0, 40),
      logo: safeImg(o?.logo_url) ?? safeImg(j?.icon),
      amount, price: price && price > 0 ? price : null,
      value: price && price > 0 ? price * amount : null,
      change24h: j?.stats24h?.priceChange ?? null,
      href: o ? `/launchpad/${o.id}` : `/terminal?mint=${mint}`,
    });
  }
  return bags;
}

const arcClient = createPublicClient({ transport: http("https://rpc.mainnet.arc.io") });

type ArcRow = { balance_raw: string; launchpad_tokens: { id: string; name: string; ticker: string; logo_url: string | null; mint_address: string | null; price_usd: number | null } | null };

export async function arcBags(wallet: string, rows: ArcRow[]): Promise<Bag[]> {
  const bags: Bag[] = [];
  try {
    const wei = await arcClient.getBalance({ address: wallet as `0x${string}` });
    const usdc = Number(wei) / 1e18; // l'USDC natif d'Arc compte 18 décimales comme jeton de gaz
    if (usdc > 0) bags.push({ chain: "arc", id: "native", symbol: "USDC", name: "USD Coin", logo: "/usdc-coin.png", amount: usdc, price: 1, value: usdc, href: null });
  } catch { /* RPC indisponible */ }
  for (const r of rows) {
    const t = r.launchpad_tokens;
    if (!t) continue;
    let amount = 0;
    try { amount = Number(BigInt(r.balance_raw ?? "0")) / 1e18; } catch { continue; }
    if (amount <= 0) continue;
    const price = t.price_usd != null && Number(t.price_usd) > 0 ? Number(t.price_usd) : null;
    bags.push({
      chain: "arc", id: t.mint_address ?? t.id, symbol: t.ticker.slice(0, 16), name: t.name.slice(0, 40), logo: safeImg(t.logo_url),
      amount, price, value: price != null ? price * amount : null, href: `/launchpad/${t.id}`,
    });
  }
  return bags;
}

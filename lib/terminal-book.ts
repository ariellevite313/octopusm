/**
 * Carnet d'ordres du Terminal (mode Limit) pour un token Solana.
 * Une pool n'a pas de carnet : on calcule, pour chaque niveau de capitalisation, combien de SOL il faut pour y amener
 * le prix (pool à produit constant : ΔSOL = R × |√(niveau / actuel) − 1|, R = moitié de la liquidité, en SOL).
 * On y ajoute les ordres limités placés depuis OM (niveau et montant seulement, jamais le wallet).
 */
import { SOL_MINT } from "@/lib/swap/core";
import { jupMarket } from "@/lib/swap/jup-market";
import { activeOrders } from "@/lib/swap/jup-trigger";

export type BookRow = { mcap: number; sol: number; om: boolean };
export type Book = { mcap: number; price: number; solUsd: number; asks: BookRow[]; bids: BookRow[] };
type Ds = { baseToken?: { address?: string }; priceUsd?: string; marketCap?: number; fdv?: number; liquidity?: { usd?: number } };
export type OmOrder = { order_key: string; maker: string; side: "buy" | "sell"; amount_sol: number; target_mcap: number; status: string; checked_at: string | null; created_at: string };

/** Écarts proposés (en %), de chaque côté du prix actuel */
export const STEPS = [0.5, 1, 2, 5, 10, 20, 35];
const ROWS = 7;

/** Profondeur de la pool : SOL nécessaires pour amener la capitalisation à chaque niveau. */
export function depth(mcap: number, liqUsd: number, solUsd: number): { asks: BookRow[]; bids: BookRow[] } {
  const R = liqUsd > 0 && solUsd > 0 ? liqUsd / 2 / solUsd : 0;
  const row = (s: number, up: boolean): BookRow => {
    const r = up ? 1 + s / 100 : 1 - s / 100;
    return { mcap: mcap * r, sol: R * Math.abs(Math.sqrt(r) - 1), om: false };
  };
  return { asks: STEPS.map((s) => row(s, true)), bids: STEPS.map((s) => row(s, false)) };
}

/** Mélange profondeur et ordres OM : les plus proches du prix actuel, asks du plus haut au plus bas, bids du plus haut au plus bas. */
export function merge(mcap: number, d: { asks: BookRow[]; bids: BookRow[] }, om: OmOrder[]): { asks: BookRow[]; bids: BookRow[] } {
  const omAsks = om.filter((o) => o.side === "sell" && o.target_mcap > mcap).map((o) => ({ mcap: Number(o.target_mcap), sol: Number(o.amount_sol), om: true }));
  const omBids = om.filter((o) => o.side === "buy" && o.target_mcap < mcap).map((o) => ({ mcap: Number(o.target_mcap), sol: Number(o.amount_sol), om: true }));
  const asks = [...d.asks, ...omAsks].sort((a, b) => a.mcap - b.mcap).slice(0, ROWS).reverse();
  const bids = [...d.bids, ...omBids].sort((a, b) => b.mcap - a.mcap).slice(0, ROWS);
  return { asks, bids };
}

async function pair(mint: string): Promise<{ price: number; mcap: number; liq: number } | null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, { signal: AbortSignal.timeout(8000), next: { revalidate: 15 } });
    const p = ((r.ok ? await r.json() : []) as Ds[]).filter((x) => x.baseToken?.address === mint).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    const mcap = p?.marketCap || p?.fdv || 0;
    if (p && Number(p.priceUsd) > 0 && mcap > 0) return { price: Number(p.priceUsd), mcap, liq: p.liquidity?.usd ?? 0 };
  } catch { /* repli Jupiter */ }
  return jupMarket(mint);
}

/**
 * Ordres OM encore actifs sur ce token. Vérifiés auprès de Jupiter (au plus une fois par minute et par ordre) :
 * un ordre exécuté ou annulé sort du carnet.
 */
 
async function omOrders(db: any, mint: string): Promise<OmOrder[]> {
  const { data } = await db.from("om_limit_orders").select("*").eq("mint", mint).in("status", ["pending", "open"]).order("created_at", { ascending: false }).limit(60);
  const rows = (data ?? []) as OmOrder[];
  const stale = rows.filter((o) => !o.checked_at || Date.now() - new Date(o.checked_at).getTime() > 60_000);
  const makers = [...new Set(stale.map((o) => o.maker))].slice(0, 8);
  await Promise.all(makers.map(async (m) => {
    const active = await activeOrders(m).then((l) => new Set(l.map((o) => o.orderKey))).catch(() => null);
    if (!active) return;
    for (const o of stale.filter((x) => x.maker === m)) {
      const young = Date.now() - new Date(o.created_at).getTime() < 3 * 60_000;
      o.status = active.has(o.order_key) ? "open" : o.status === "pending" && young ? "pending" : "closed";
      await db.from("om_limit_orders").update({ status: o.status, checked_at: new Date().toISOString() }).eq("order_key", o.order_key);
    }
  }));
  return rows.filter((o) => o.status === "open");
}

 
export async function getBook(db: any, mint: string): Promise<Book | null> {
  const [tok, sol, om] = await Promise.all([pair(mint), pair(SOL_MINT), omOrders(db, mint).catch(() => [])]);
  if (!tok || !sol) return null;
  return { mcap: tok.mcap, price: tok.price, solUsd: sol.price, ...merge(tok.mcap, depth(tok.mcap, tok.liq, sol.price), om) };
}

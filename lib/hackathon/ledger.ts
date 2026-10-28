/** Lecture de l'historique d'achats et de ventes d'un token (Solana : token_trades, Arc : arc_trades). */
import { computeVotes, type Trade } from "./votes";
import { RULES } from "./rules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
export type WalletTrade = Trade & { wallet: string };
export type TokenRef = { id: string; chain: string | null; arc_launch_id: string | null };

const norm = (w: string) => (/^0x[0-9a-fA-F]{40}$/.test(w) ? w.toLowerCase() : w);

export async function loadTrades(db: Db, token: TokenRef, onlyWallet?: string): Promise<WalletTrade[]> {
  const out: WalletTrade[] = [];
  if (token.chain === "arc") {
    if (!token.arc_launch_id) return out;
    for (let from = 0; from < 200_000; from += 1000) {
      let q = db.from("arc_trades").select("trader, is_buy, usdc_amt, token_amt, ts").ilike("curve", token.arc_launch_id);
      if (onlyWallet) q = q.ilike("trader", onlyWallet);
      const { data, error } = await q.order("ts", { ascending: true }).range(from, from + 999);
      if (error) break;
      for (const r of (data ?? []) as { trader: string; is_buy: boolean; usdc_amt: number; token_amt: number; ts: number }[]) {
        out.push({ wallet: norm(r.trader), side: r.is_buy ? "buy" : "sell", usd: Number(r.usdc_amt), tokenAmount: Number(r.token_amt), tsMs: Number(r.ts) * 1000 });
      }
      if (!data || data.length < 1000) break;
    }
    return out;
  }
  for (let from = 0; from < 200_000; from += 1000) {
    let q = db.from("token_trades").select("wallet, side, usd, token_amount, ts").eq("token_id", token.id);
    if (onlyWallet) q = q.eq("wallet", onlyWallet);
    const { data, error } = await q.order("ts", { ascending: true }).range(from, from + 999);
    if (error) break;
    for (const r of (data ?? []) as { wallet: string; side: "buy" | "sell"; usd: number | string; token_amount: number | string; ts: string }[]) {
      out.push({ wallet: norm(r.wallet), side: r.side, usd: Number(r.usd), tokenAmount: Number(r.token_amount), tsMs: Date.parse(r.ts) });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Votes par wallet (équipe exclue, plafond appliqué) et volume net dans la fenêtre. */
export function summarize(trades: WalletTrade[], team: Set<string>, win: { startMs: number; endMs: number }) {
  const byWallet = new Map<string, Trade[]>();
  let volumeUsd = 0;
  for (const t of trades) {
    if (team.has(t.wallet)) continue;
    if (t.tsMs >= win.startMs && t.tsMs <= win.endMs) volumeUsd += t.usd;
    const l = byWallet.get(t.wallet) ?? [];
    l.push(t);
    byWallet.set(t.wallet, l);
  }
  const votesByWallet = new Map<string, number>();
  let votes = 0;
  for (const [w, l] of byWallet) {
    const v = Math.min(computeVotes(l, win), RULES.voteCapPerWallet);
    if (v >= RULES.minVoteUsd) { votesByWallet.set(w, v); votes += v; }
  }
  return { votes, votesByWallet, volumeUsd, recent7d: trades.some((t) => t.tsMs > Date.now() - 7 * 86_400_000) };
}

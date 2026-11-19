/**
 * Prix, capitalisation et liquidité d'un token Solana selon Jupiter (repli quand DexScreener ne connaît pas le token
 * ou ne donne pas sa capitalisation). Tout token que Jupiter sait échanger y figure.
 */
type JupToken = { id?: string; usdPrice?: number; mcap?: number; fdv?: number; liquidity?: number };

export async function jupMarket(mint: string): Promise<{ price: number; mcap: number; liq: number } | null> {
  try {
    const r = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`, { signal: AbortSignal.timeout(8000), next: { revalidate: 15 } });
    const t = ((r.ok ? await r.json() : []) as JupToken[]).find((x) => x.id === mint);
    const price = Number(t?.usdPrice ?? 0), mcap = Number(t?.mcap || t?.fdv || 0);
    return price > 0 && mcap > 0 ? { price, mcap, liq: Number(t?.liquidity ?? 0) } : null;
  } catch { return null; }
}

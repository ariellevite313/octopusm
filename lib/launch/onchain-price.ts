import BN from "bn.js";
import { Connection, PublicKey } from "@solana/web3.js";

const WSOL = "So11111111111111111111111111111111111111112";
const BASE_DECIMALS = 6;   // tokens lancés sur la courbe : 6 décimales
const QUOTE_DECIMALS = 9;  // SOL

/** Prix d'un token en USD à partir du sqrtPrice de la courbe (SOL par token × prix du SOL). */
export async function priceUsdFromSqrt(sqrtPrice: BN, solUsd: number): Promise<number | null> {
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const solPerToken = sdk.getPriceFromSqrtPrice(sqrtPrice, BASE_DECIMALS as never, QUOTE_DECIMALS as never).toNumber();
  const usd = solPerToken * solUsd;
  return Number.isFinite(usd) && usd > 0 ? usd : null;
}

let solCache: { at: number; usd: number } | null = null;
/** Prix du SOL en USD (cache 60 s), via GeckoTerminal. */
export async function fetchSolUsd(): Promise<number | null> {
  if (solCache && Date.now() - solCache.at < 60_000) return solCache.usd;
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${WSOL}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return solCache?.usd ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usd = parseFloat(((await r.json()) as any)?.data?.attributes?.price_usd);
    if (!Number.isFinite(usd) || usd <= 0) return solCache?.usd ?? null;
    solCache = { at: Date.now(), usd };
    return usd;
  } catch {
    return solCache?.usd ?? null;
  }
}

/** Prix et capitalisation lus directement sur la courbe (quand DexScreener / GeckoTerminal n'ont rien). */
export async function onchainStats(conn: Connection, poolAddress: string, supply: number, solUsd: number) {
  try {
    const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    const client = new sdk.DynamicBondingCurveClient(conn, "confirmed");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool: any = await client.state.getPool(new PublicKey(poolAddress));
    const sqrt = pool?.poolState?.sqrtPrice ?? pool?.sqrtPrice;
    if (!sqrt) return null;
    const priceUsd = await priceUsdFromSqrt(new BN(sqrt.toString()), solUsd);
    if (priceUsd === null) return null;
    return { priceUsd, marketCap: supply > 0 ? priceUsd * supply : null, volume24h: null as number | null };
  } catch {
    return null;
  }
}

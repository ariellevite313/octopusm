/**
 * Lecture des trades d'une bonding curve Arc V2, par tranches de blocs (le RPC refuse les plages trop grandes),
 * avec mémorisation en base et reprise là où on s'était arrêté.
 *
 * Event : Trade(address indexed trader, bool isBuy, uint256 usdcAmount, uint256 tokenAmount, uint256 fee,
 *               uint256 realUsdcRaised, uint256 reserveUsdc, uint256 reserveTokens) — USDC Arc natif 18 décimales.
 */
import { createPublicClient, http, parseAbi } from "viem";
import { arc } from "@/lib/arc-chain";
import { createAdminClient } from "@/lib/supabase/server";

const ARC_RPC = "https://rpc.mainnet.arc.io";
export const CHUNK = 2_000n;
const FALLBACK_RANGE = 300_000n; // si le bloc de création est inconnu
const PARALLEL = 6;

const TRADE_EVENT = parseAbi([
  "event Trade(address indexed trader, bool isBuy, uint256 usdcAmount, uint256 tokenAmount, uint256 fee, uint256 realUsdcRaised, uint256 reserveUsdc, uint256 reserveTokens)",
])[0];

export type ArcTrade = { timestamp: number; isBuy: boolean; trader: string; usdcAmt: number; tokenAmt: number; price: number; txHash: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const client = () => createPublicClient({ chain: arc, transport: http(ARC_RPC, { timeout: 15_000, retryCount: 2 }) });

/**
 * Lit les nouveaux trades depuis le dernier bloc lu (au plus `maxChunks` tranches par appel) et les enregistre.
 * Retourne true si la courbe est à jour.
 */
export async function syncCurveTrades(curveRaw: string, maxChunks = 40, db: Db = createAdminClient()): Promise<boolean> {
  const curve = curveRaw.toLowerCase() as `0x${string}`;
  const pc = client();
  const latest = await pc.getBlockNumber();

  const { data: st } = await db.from("arc_trades_state").select("last_block").eq("curve", curve).maybeSingle();
  let from: bigint;
  if (st?.last_block != null) from = BigInt(st.last_block) + 1n;
  else {
    const { data: tok } = await db.from("launchpad_tokens").select("arc_creation_block").ilike("arc_launch_id", curve).maybeSingle();
    from = tok?.arc_creation_block ? BigInt(tok.arc_creation_block) : latest > FALLBACK_RANGE ? latest - FALLBACK_RANGE : 0n;
  }
  if (from > latest) return true;

  // Tranches à lire (dans l'ordre)
  const ranges: [bigint, bigint][] = [];
  for (let a = from; a <= latest && ranges.length < maxChunks; a += CHUNK) {
    ranges.push([a, a + CHUNK - 1n < latest ? a + CHUNK - 1n : latest]);
  }

  const tsCache = new Map<bigint, number>();
  const blockTs = async (n: bigint) => {
    if (!tsCache.has(n)) tsCache.set(n, Number((await pc.getBlock({ blockNumber: n })).timestamp));
    return tsCache.get(n)!;
  };

  let reached = from - 1n;
  for (let i = 0; i < ranges.length; i += PARALLEL) {
    const batch = ranges.slice(i, i + PARALLEL);
    const results = await Promise.all(batch.map(async ([a, b]) => {
      const logs = await pc.getLogs({ address: curve, event: TRADE_EVENT, fromBlock: a, toBlock: b });
      if (!logs.length) return { b, rows: [] as Record<string, unknown>[] };
      // Horodatage réel : début et fin de tranche, interpolation linéaire entre les deux
      const [ta, tb] = await Promise.all([blockTs(a), blockTs(b)]);
      const span = Number(b - a) || 1;
      const rows = logs.flatMap((l) => {
        const { trader, isBuy, usdcAmount, tokenAmount } = l.args as { trader: string; isBuy: boolean; usdcAmount: bigint; tokenAmount: bigint };
        const usdc = Number(usdcAmount) / 1e18, tok = Number(tokenAmount) / 1e18;
        const price = tok > 0 ? usdc / tok : 0;
        if (!(price > 0) || l.blockNumber == null) return [];
        const ts = Math.round(ta + ((tb - ta) * Number(l.blockNumber - a)) / span);
        return [{ curve, tx_hash: String(l.transactionHash), log_index: Number(l.logIndex ?? 0), block: Number(l.blockNumber), ts, is_buy: Boolean(isBuy), trader: String(trader).toLowerCase(), usdc_amt: usdc, token_amt: tok, price }];
      });
      return { b, rows };
    }));
    const rows = results.flatMap((r) => r.rows);
    if (rows.length) {
      const { error } = await db.from("arc_trades").upsert(rows, { onConflict: "curve,tx_hash,log_index", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    reached = batch[batch.length - 1][1];
    await db.from("arc_trades_state").upsert({ curve, last_block: Number(reached), updated_at: new Date().toISOString() });
  }
  return reached >= latest;
}

export async function readCurveTrades(curveRaw: string, limit = 1000, db: Db = createAdminClient()): Promise<ArcTrade[]> {
  const curve = curveRaw.toLowerCase();
  const { data } = await db.from("arc_trades").select("ts, is_buy, trader, usdc_amt, token_amt, price, tx_hash").eq("curve", curve).order("ts", { ascending: false }).limit(limit);
  return ((data ?? []) as { ts: number; is_buy: boolean; trader: string; usdc_amt: number; token_amt: number; price: number; tx_hash: string }[])
    .map((r) => ({ timestamp: Number(r.ts), isBuy: r.is_buy, trader: r.trader, usdcAmt: r.usdc_amt, tokenAmt: r.token_amt, price: r.price, txHash: r.tx_hash }))
    .reverse();
}

/**
 * Lecture des trades d'une bonding curve Arc V2, par tranches de blocs (le RPC refuse les plages trop grandes),
 * avec mémorisation en base et reprise là où on s'était arrêté.
 *
 * Event : Trade(address indexed trader, bool isBuy, uint256 usdcAmount, uint256 tokenAmount, uint256 fee,
 *               uint256 realUsdcRaised, uint256 reserveUsdc, uint256 reserveTokens) — USDC Arc natif 18 décimales.
 */
import { createPublicClient, http, parseAbi, encodeAbiParameters, keccak256, zeroAddress } from "viem";
import { arc } from "@/lib/arc-chain";
import { createAdminClient } from "@/lib/supabase/server";

const ARC_RPC = "https://rpc.mainnet.arc.io";
export const CHUNK = 2_000n;
const FALLBACK_RANGE = 300_000n; // si le bloc de création est inconnu
const PARALLEL = 6;

export const ARC_V4_POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as const;
const SWAP_EVENT = parseAbi([
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
])[0];
const DIRECT_FACTORY_ABI = parseAbi(["function isVault(address) view returns (bool)"]);

/** Identifiant du pool Uniswap V4 USDC natif / token (frais 0,50 %, espacement 60, sans hook). */
export function arcPoolId(token: string): `0x${string}` {
  return keccak256(encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
    [zeroAddress, token as `0x${string}`, 5000, 60, zeroAddress],
  ));
}

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
  const curve = curveRaw.toLowerCase();
  const { data: tok } = await db.from("launchpad_tokens").select("mint_address, status").ilike("arc_launch_id", curve).maybeSingle();
  const token = tok?.mint_address as string | undefined;
  const hasPool = Boolean(token) && /^0x[0-9a-fA-F]{40}$/.test(token!) && (tok?.status === "graduated" || (await isDirectVault(curve)));
  // Lancement direct : aucun événement Trade de courbe, seulement le pool V4. Token gradué : on lit aussi le pool.
  let poolDone = true;
  if (hasPool) poolDone = await syncPoolSwaps(curve, token!, maxChunks, db).catch((e) => { console.error("[arc-trades] pool:", e instanceof Error ? e.message : e); return false; });
  if (hasPool && (await isDirectVault(curve))) return poolDone;
  const curveDone = await syncBondingCurveTrades(curveRaw, maxChunks, db);
  return curveDone && poolDone;
}

async function syncBondingCurveTrades(curveRaw: string, maxChunks = 40, db: Db = createAdminClient()): Promise<boolean> {
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

const directCache = new Map<string, boolean>();
/** Vrai si l'adresse est un vault de lancement direct Uniswap V4 (factory configurée par NEXT_PUBLIC_ARC_FACTORY_DIRECT). */
async function isDirectVault(curve: string): Promise<boolean> {
  const factory = process.env.NEXT_PUBLIC_ARC_FACTORY_DIRECT;
  if (!factory || !/^0x[0-9a-fA-F]{40}$/.test(factory)) return false;
  if (directCache.has(curve)) return directCache.get(curve)!;
  try {
    const ok = Boolean(await client().readContract({ address: factory as `0x${string}`, abi: DIRECT_FACTORY_ABI, functionName: "isVault", args: [curve as `0x${string}`] }));
    directCache.set(curve, ok);
    return ok;
  } catch { return false; }
}

/**
 * Swaps du pool Uniswap V4 d'un token (lancement direct, ou token de courbe déjà gradué), mémorisés dans la même
 * table arc_trades que les trades de la courbe : le graphique reste continu (même unité : USDC par token).
 * Retourne true si le pool est à jour.
 */
export async function syncPoolSwaps(curveRaw: string, tokenRaw: string, maxChunks = 40, db: Db = createAdminClient()): Promise<boolean> {
  const curve = curveRaw.toLowerCase();
  const stateKey = `${curve}:v4`;
  const poolId = arcPoolId(tokenRaw.toLowerCase());
  const pc = client();
  const latest = await pc.getBlockNumber();
  const { data: st } = await db.from("arc_trades_state").select("last_block").eq("curve", stateKey).maybeSingle();
  let from: bigint;
  if (st?.last_block != null) from = BigInt(st.last_block) + 1n;
  else {
    const { data: tok } = await db.from("launchpad_tokens").select("arc_creation_block").ilike("arc_launch_id", curve).maybeSingle();
    from = tok?.arc_creation_block ? BigInt(tok.arc_creation_block) : latest > FALLBACK_RANGE ? latest - FALLBACK_RANGE : 0n;
  }
  if (from > latest) return true;
  const ranges: [bigint, bigint][] = [];
  for (let a = from; a <= latest && ranges.length < maxChunks; a += CHUNK) ranges.push([a, a + CHUNK - 1n < latest ? a + CHUNK - 1n : latest]);

  const tsCache = new Map<bigint, number>();
  const blockTs = async (n: bigint) => {
    if (!tsCache.has(n)) tsCache.set(n, Number((await pc.getBlock({ blockNumber: n })).timestamp));
    return tsCache.get(n)!;
  };
  let reached = from - 1n;
  for (let i = 0; i < ranges.length; i += PARALLEL) {
    const batch = ranges.slice(i, i + PARALLEL);
    const results = await Promise.all(batch.map(async ([a, b]) => {
      const logs = await pc.getLogs({ address: ARC_V4_POOL_MANAGER, event: SWAP_EVENT, args: { id: poolId }, fromBlock: a, toBlock: b });
      if (!logs.length) return [] as Record<string, unknown>[];
      const [ta, tb] = await Promise.all([blockTs(a), blockTs(b)]);
      const span = Number(b - a) || 1;
      return logs.flatMap((l) => {
        const { sender, amount0, amount1 } = l.args as { sender: string; amount0: bigint; amount1: bigint };
        const usdc = Math.abs(Number(amount0)) / 1e18, tok = Math.abs(Number(amount1)) / 1e18;
        const price = tok > 0 ? usdc / tok : 0;
        if (!(price > 0) || l.blockNumber == null) return [];
        const ts = Math.round(ta + ((tb - ta) * Number(l.blockNumber - a)) / span);
        // Montants du point de vue de l'appelant : il paie de l'USDC (amount0 < 0) quand il achète le token
        return [{ curve, tx_hash: String(l.transactionHash), log_index: Number(l.logIndex ?? 0), block: Number(l.blockNumber), ts, is_buy: amount0 < 0n, trader: String(sender).toLowerCase(), usdc_amt: usdc, token_amt: tok, price }];
      });
    }));
    const rows = results.flat();
    if (rows.length) {
      const { error } = await db.from("arc_trades").upsert(rows, { onConflict: "curve,tx_hash,log_index", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    reached = batch[batch.length - 1][1];
    await db.from("arc_trades_state").upsert({ curve: stateKey, last_block: Number(reached), updated_at: new Date().toISOString() });
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

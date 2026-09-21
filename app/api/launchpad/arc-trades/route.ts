/**
 * GET /api/launchpad/arc-trades?curveAddress=0x...&limit=500
 *
 * Récupère les événements Trade de BondingCurveArcV2 via eth_getLogs sur le RPC Arc.
 * (Ne dépend plus de l'API ArcScan/Blockscout qui filtre mal topic0.)
 *
 * Event V2 :
 *   Trade(address indexed trader, bool isBuy, uint256 usdcAmount, uint256 tokenAmount,
 *         uint256 fee, uint256 realUsdcRaised, uint256 reserveUsdc, uint256 reserveTokens)
 *
 * USDC Arc = natif 18 decimals.
 */

import { NextResponse }            from "next/server";
import { createPublicClient, http, parseAbi } from "viem";
import { arc }                     from "@/lib/arc-chain";
import { createAdminClient }       from "@/lib/supabase/server";

export const maxDuration = 60;

const ARC_RPC = "https://rpc.mainnet.arc.io";

// Nombre max de blocs à scanner quand creationBlock est inconnu (~7 jours à 2s/block)
const MAX_BLOCK_RANGE = 300_000n;

const TRADE_EVENT_ABI = parseAbi([
  "event Trade(address indexed trader, bool isBuy, uint256 usdcAmount, uint256 tokenAmount, uint256 fee, uint256 realUsdcRaised, uint256 reserveUsdc, uint256 reserveTokens)",
]);

type Trade = {
  timestamp: number;
  isBuy:     boolean;
  usdcAmt:   number;
  tokenAmt:  number;
  price:     number;
  txHash:    string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const curveAddress = searchParams.get("curveAddress");
  const limit        = Math.min(parseInt(searchParams.get("limit") ?? "500") || 500, 1000);

  if (!curveAddress || !/^0x[0-9a-fA-F]{40}$/.test(curveAddress)) {
    return NextResponse.json({ error: "curveAddress required (0x…)" }, { status: 400 });
  }

  try {
    const client = createPublicClient({ chain: arc, transport: http(ARC_RPC) });

    // ── 1. Bloc de création depuis la DB (pour limiter le scan) ──────────────
    let fromBlock: bigint | undefined;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = createAdminClient() as any;
      const { data: tokenRow } = await admin
        .from("launchpad_tokens")
        .select("arc_creation_block")
        .ilike("arc_launch_id", curveAddress)
        .maybeSingle();

      if (tokenRow?.arc_creation_block) {
        fromBlock = BigInt(tokenRow.arc_creation_block);
      }
    } catch { /* ignore — on scannera depuis MAX_BLOCK_RANGE */ }

    // Si pas de bloc connu, on scanne les derniers MAX_BLOCK_RANGE blocs
    if (fromBlock === undefined) {
      const latest = await client.getBlockNumber();
      fromBlock = latest > MAX_BLOCK_RANGE ? latest - MAX_BLOCK_RANGE : 0n;
    }

    // ── 2. eth_getLogs directement sur le RPC ─────────────────────────────────
    const logs = await client.getLogs({
      address:  curveAddress as `0x${string}`,
      event:    TRADE_EVENT_ABI[0],
      fromBlock,
      toBlock:  "latest",
    });

    if (!logs.length) {
      return NextResponse.json({ trades: [] });
    }

    // ── 3. Timestamps via getBlock pour chaque bloc unique ────────────────────
    const uniqueBlocks = [...new Set(logs.map(l => l.blockNumber).filter((n): n is bigint => n !== null))];

    // Batch limité à 50 appels parallèles pour éviter de saturer le RPC
    const BATCH = 50;
    const blockTimestamps = new Map<bigint, number>();
    for (let i = 0; i < uniqueBlocks.length; i += BATCH) {
      const chunk = uniqueBlocks.slice(i, i + BATCH);
      const blocks = await Promise.all(
        chunk.map(bn => client.getBlock({ blockNumber: bn }).catch(() => null))
      );
      for (const b of blocks) {
        if (b) blockTimestamps.set(b.number, Number(b.timestamp));
      }
    }

    // ── 4. Assembler les trades ───────────────────────────────────────────────
    const trades: Trade[] = logs
      .map(l => {
        try {
          const { isBuy, usdcAmount, tokenAmount } = l.args as {
            isBuy:       boolean;
            usdcAmount:  bigint;
            tokenAmount: bigint;
          };
          const usdcAmt  = Number(usdcAmount)  / 1e18;
          const tokenAmt = Number(tokenAmount) / 1e18;
          const price    = tokenAmt > 0 ? usdcAmt / tokenAmt : 0;
          if (price <= 0) return null;
          const timestamp = l.blockNumber !== null
            ? (blockTimestamps.get(l.blockNumber) ?? 0)
            : 0;
          return {
            timestamp,
            isBuy:    Boolean(isBuy),
            usdcAmt,
            tokenAmt,
            price,
            txHash: l.transactionHash ?? "",
          };
        } catch { return null; }
      })
      .filter((t): t is Trade => t !== null && t.timestamp > 0)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-limit);

    return NextResponse.json({ trades }, {
      headers: { "Cache-Control": "no-store" },
    });

  } catch (err) {
    console.error("[arc-trades]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

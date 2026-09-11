/**
 * GET /api/launchpad/arc-trades?curveAddress=0x...&limit=500
 *
 * Fetches Trade events from an Arc BondingCurve clone contract.
 * Returns sorted trade list with timestamps and computed price.
 *
 * Price formula: price (USDC per token) = usdcAmt(6 dec) / tokenAmt(18 dec)
 *   = usdcAmt * 1e12 / tokenAmt
 */

import { NextResponse } from "next/server";
import { createPublicClient, http, decodeAbiParameters, parseAbiParameters } from "viem";
import { arcTestnet } from "@/lib/arc-chain";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 60; // 60s max (Vercel Pro/Hobby)

// Topic réel du contrat déployé (vérifié sur ArcScan)
// keccak256("Trade(address,bool,uint256,uint256,uint256,uint256,uint256,uint256)")
const TRADE_TOPIC = "0x0c668488dc690d00c35c03638df49a1c8a7b63511eba0f88eeed1bd471719b16" as `0x${string}`;

// ABI des paramètres non-indexés dans data (dans l'ordre d'émission)
const TRADE_DATA_PARAMS = parseAbiParameters(
  "bool isBuy, uint256 usdcAmount, uint256 tokenAmount, uint256 fee, uint256 realUsdcRaised, uint256 reserveUsdc, uint256 reserveTokens"
);

const BLOCK_TIME_SEC = 2; // Arc testnet approximate block time

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const curveAddress = searchParams.get("curveAddress");
  const limit        = Math.min(parseInt(searchParams.get("limit") ?? "500") || 500, 1000);
  const debug        = searchParams.get("debug") === "1";

  if (!curveAddress || !/^0x[0-9a-fA-F]{40}$/.test(curveAddress)) {
    return NextResponse.json({ error: "curveAddress required (0x…)" }, { status: 400 });
  }

  try {
    const client = createPublicClient({
      chain:     arcTestnet,
      transport: http(),
    });

    // ── Fetch current block (for timestamp estimation) ─────────────────────
    const currentBlock = await client.getBlockNumber();
    const currentBlock_n = Number(currentBlock);

    // Get current block timestamp
    const headBlock = await client.getBlock({ blockNumber: currentBlock });
    const headTimestamp = Number(headBlock.timestamp);

    // ── Fetch Trade logs in sequential batches (avoid RPC rate limits) ──────
    // Utilise arc_creation_block depuis la DB si dispo (précis),
    // sinon fallback sur 2M blocs (~46 jours à 2s/bloc).
    const CHUNK_SIZE  = 50_000n;
    const BATCH_SIZE  = 5;        // chunks traités en parallèle par lot
    const SCAN_DEPTH  = 2_000_000n;

    // Chercher le bloc de création en DB (case-insensitive address match)
    let creationBlock: bigint | null = null;
    let debugInfo: Record<string, unknown> = {};
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = createAdminClient() as any;
      const { data: tokenRow, error: dbErr } = await admin
        .from("launchpad_tokens")
        .select("arc_creation_block, arc_launch_id")
        .ilike("arc_launch_id", curveAddress)  // case-insensitive
        .maybeSingle();
      debugInfo = { tokenRow, dbErr: dbErr?.message ?? null };
      if (tokenRow?.arc_creation_block) {
        creationBlock = BigInt(tokenRow.arc_creation_block);
      }
    } catch (e) { debugInfo = { dbError: String(e) }; }

    const fromBlock = creationBlock
      ? creationBlock
      : (currentBlock > SCAN_DEPTH ? currentBlock - SCAN_DEPTH : 0n);

    // Build chunk list
    const chunkStarts: bigint[] = [];
    for (let s = fromBlock; s <= currentBlock; s += CHUNK_SIZE) chunkStarts.push(s);

    // Process in sequential batches to avoid hammering the RPC
    const allLogs: Awaited<ReturnType<typeof client.getLogs>> = [];
    for (let i = 0; i < chunkStarts.length; i += BATCH_SIZE) {
      const batch = chunkStarts.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(start => {
          const end = start + CHUNK_SIZE - 1n < currentBlock ? start + CHUNK_SIZE - 1n : currentBlock;
          return client.getLogs({
            address:   curveAddress as `0x${string}`,
            topics:    [TRADE_TOPIC],
            fromBlock: start,
            toBlock:   end,
          });
        }),
      );
      for (const r of results) {
        if (r.status === "fulfilled") allLogs.push(...r.value);
      }
    }

    const logs = allLogs;

    if (logs.length === 0) {
      // Debug: fetch raw logs (no event filter) for first chunk to inspect actual topics
      let rawLogs: { topics: readonly string[]; data: string; blockNumber: bigint | null }[] = [];
      if (debug) {
        try {
          rawLogs = await client.getLogs({
            address:   curveAddress as `0x${string}`,
            topics:    [TRADE_TOPIC],
            fromBlock: fromBlock,
            toBlock:   fromBlock + CHUNK_SIZE - 1n < currentBlock ? fromBlock + CHUNK_SIZE - 1n : currentBlock,
          });
        } catch { /* ignore */ }
      }
      return NextResponse.json({
        trades: [],
        ...(debug ? {
          _debug: {
            currentBlock: currentBlock.toString(),
            fromBlock: fromBlock.toString(),
            creationBlock: creationBlock?.toString() ?? null,
            chunks: chunkStarts.length,
            rawLogsCount: rawLogs.length,
            rawLogTopics: rawLogs.slice(0, 5).map(l => ({ topic0: l.topics[0], blockNumber: l.blockNumber?.toString() })),
            ...debugInfo,
          }
        } : {}),
      }, {
        headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" },
      });
    }

    // ── Batch-fetch block timestamps for unique block numbers ──────────────
    const uniqueBlocks = [...new Set(logs.map(l => l.blockNumber ?? 0n))];

    // Fetch up to 50 blocks concurrently; for the rest, estimate from head
    const FETCH_LIMIT = 50;
    const blockTimestamps = new Map<bigint, number>();

    const toFetch = uniqueBlocks.slice(0, FETCH_LIMIT);
    const estimated = uniqueBlocks.slice(FETCH_LIMIT);

    await Promise.all(
      toFetch.map(async bn => {
        try {
          const b = await client.getBlock({ blockNumber: bn });
          blockTimestamps.set(bn, Number(b.timestamp));
        } catch {
          // fallback: estimate
          const diff = currentBlock_n - Number(bn);
          blockTimestamps.set(bn, headTimestamp - diff * BLOCK_TIME_SEC);
        }
      }),
    );

    // Estimate timestamps for remaining blocks
    for (const bn of estimated) {
      const diff = currentBlock_n - Number(bn);
      blockTimestamps.set(bn, headTimestamp - diff * BLOCK_TIME_SEC);
    }

    // ── Build trade list ───────────────────────────────────────────────────
    type Trade = {
      timestamp: number;
      isBuy:     boolean;
      usdcAmt:   number;   // in USDC (6 dec → float)
      tokenAmt:  number;   // in tokens (18 dec → float)
      price:     number;   // USDC per token
      txHash:    string;
    };

    const trades: Trade[] = logs
      .filter(l => l.data && l.data !== "0x")
      .map(l => {
        try {
          // Trader address est dans topics[1] (indexed)
          // Data contient: bool isBuy, uint256 usdcAmount, uint256 tokenAmount, uint256 fee, uint256 realUsdcRaised, uint256 reserveUsdc, uint256 reserveTokens
          const decoded = decodeAbiParameters(TRADE_DATA_PARAMS, l.data as `0x${string}`);
          const isBuy   = Boolean(decoded[0]);
          const usdcRaw = decoded[1] as bigint;
          const tokRaw  = decoded[2] as bigint;
          const usdcAmt  = Number(usdcRaw) / 1e6;
          const tokenAmt = Number(tokRaw)  / 1e18;
          const price    = tokRaw > 0n ? Number(usdcRaw * 10n**12n / tokRaw) / 1e12 : 0;
          const ts       = blockTimestamps.get(l.blockNumber ?? 0n) ?? headTimestamp;
          return { timestamp: ts, isBuy, usdcAmt, tokenAmt, price, txHash: l.transactionHash ?? "" };
        } catch { return null; }
      })
      .filter((t): t is Trade => t !== null && t.price > 0)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-limit);

    return NextResponse.json({ trades }, {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
    });

  } catch (err) {
    console.error("[arc-trades]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

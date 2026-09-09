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
import { createPublicClient, http, parseAbiItem } from "viem";
import { arcTestnet } from "@/lib/arc-chain";

const TRADE_EVENT = parseAbiItem(
  "event Trade(address indexed trader, bool isBuy, uint256 usdcAmt, uint256 tokenAmt, uint256 fee)",
);

const BLOCK_TIME_SEC = 2; // Arc testnet approximate block time

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const curveAddress = searchParams.get("curveAddress");
  const limit        = Math.min(parseInt(searchParams.get("limit") ?? "500"), 1000);

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

    // ── Fetch Trade logs in chunks (RPC usually limits to 2k-10k blocks) ───
    // Scan last 100k blocks (~55h at 2s/block), split into 5k-block chunks
    const SCAN_DEPTH  = 100_000n;
    const CHUNK_SIZE  = 5_000n;
    const fromBlock   = currentBlock > SCAN_DEPTH ? currentBlock - SCAN_DEPTH : 0n;

    const logs = [];
    for (let start = fromBlock; start <= currentBlock; start += CHUNK_SIZE) {
      const end = start + CHUNK_SIZE - 1n < currentBlock ? start + CHUNK_SIZE - 1n : currentBlock;
      try {
        const chunk = await client.getLogs({
          address:   curveAddress as `0x${string}`,
          event:     TRADE_EVENT,
          fromBlock: start,
          toBlock:   end,
        });
        logs.push(...chunk);
      } catch {
        // If this chunk fails, skip it and continue
      }
    }

    if (logs.length === 0) {
      return NextResponse.json({ trades: [] }, {
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
      .filter(l => l.args?.usdcAmt !== undefined && l.args?.tokenAmt !== undefined)
      .map(l => {
        const usdcRaw  = BigInt(l.args!.usdcAmt!  as bigint);
        const tokRaw   = BigInt(l.args!.tokenAmt! as bigint);
        const usdcAmt  = Number(usdcRaw) / 1e6;
        const tokenAmt = Number(tokRaw)  / 1e18;
        const price    = tokenAmt > 0 ? usdcAmt / tokenAmt : 0;
        const ts       = blockTimestamps.get(l.blockNumber ?? 0n) ?? headTimestamp;
        return {
          timestamp: ts,
          isBuy:     Boolean(l.args!.isBuy),
          usdcAmt,
          tokenAmt,
          price,
          txHash:    l.transactionHash ?? "",
        };
      })
      .filter(t => t.price > 0)
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

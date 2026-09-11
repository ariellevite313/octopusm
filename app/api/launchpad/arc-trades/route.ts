/**
 * GET /api/launchpad/arc-trades?curveAddress=0x...&limit=500
 *
 * Fetches Trade events from an Arc BondingCurve clone contract.
 * Uses ArcScan (Blockscout) API instead of eth_getLogs — the Arc RPC does
 * not support getLogs.
 *
 * Price formula: price (USDC per token) = usdcAmt(6 dec) / tokenAmt(18 dec)
 */

import { NextResponse } from "next/server";
import { decodeAbiParameters, parseAbiParameters } from "viem";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const ARCSCAN_API = "https://testnet.arcscan.app/api";

// Topic réel du contrat déployé (vérifié sur ArcScan CSV export)
const TRADE_TOPIC = "0x0c668488dc690d00c35c03638df49a1c8a7b63511eba0f88eeed1bd471719b16";

// ABI des paramètres non-indexés dans data
const TRADE_DATA_PARAMS = parseAbiParameters(
  "bool isBuy, uint256 usdcAmount, uint256 tokenAmount, uint256 fee, uint256 realUsdcRaised, uint256 reserveUsdc, uint256 reserveTokens"
);

type BlockscoutLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;   // hex or decimal
  timeStamp: string;     // hex unix timestamp
  transactionHash: string;
  logIndex: string;
};

type BlockscoutResponse = {
  status: string;
  message: string;
  result: BlockscoutLog[] | string;
};

async function fetchLogsFromArcScan(
  address: string,
  fromBlock: number | null,
  toBlock = "latest",
): Promise<BlockscoutLog[]> {
  const params = new URLSearchParams({
    module:  "logs",
    action:  "getLogs",
    address,
    topic0:  TRADE_TOPIC,
    toBlock: String(toBlock),
  });
  if (fromBlock !== null) {
    params.set("fromBlock", String(fromBlock));
  }

  const url = `${ARCSCAN_API}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { "Accept": "application/json" },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`ArcScan API error: ${res.status} ${res.statusText}`);
  }

  const json: BlockscoutResponse = await res.json();

  if (json.status !== "1") {
    // "No records found" is status "0" with message "No records found" — not an error
    if (typeof json.result === "string" && json.result.toLowerCase().includes("no record")) {
      return [];
    }
    if (json.message === "No records found") return [];
    // Real error
    throw new Error(`ArcScan: ${json.message} — ${JSON.stringify(json.result)}`);
  }

  return Array.isArray(json.result) ? json.result : [];
}

function hexOrDecToNumber(val: string): number {
  if (!val) return 0;
  if (val.startsWith("0x") || val.startsWith("0X")) return parseInt(val, 16);
  return parseInt(val, 10);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const curveAddress = searchParams.get("curveAddress");
  const limit        = Math.min(parseInt(searchParams.get("limit") ?? "500") || 500, 1000);
  const debug        = searchParams.get("debug") === "1";

  if (!curveAddress || !/^0x[0-9a-fA-F]{40}$/.test(curveAddress)) {
    return NextResponse.json({ error: "curveAddress required (0x…)" }, { status: 400 });
  }

  try {
    // ── Get creation block from DB (optional — improves accuracy) ─────────
    let creationBlock: number | null = null;
    let debugInfo: Record<string, unknown> = {};

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = createAdminClient() as any;
      const { data: tokenRow, error: dbErr } = await admin
        .from("launchpad_tokens")
        .select("arc_creation_block, arc_launch_id")
        .ilike("arc_launch_id", curveAddress)
        .maybeSingle();
      debugInfo = { tokenRow, dbErr: dbErr?.message ?? null };
      if (tokenRow?.arc_creation_block) {
        creationBlock = Number(tokenRow.arc_creation_block);
      }
    } catch (e) {
      debugInfo = { dbError: String(e) };
    }

    // ── Fetch logs from ArcScan ────────────────────────────────────────────
    let logs: BlockscoutLog[];
    try {
      logs = await fetchLogsFromArcScan(curveAddress, creationBlock, "latest");
    } catch (err) {
      if (debug) {
        return NextResponse.json({
          trades: [],
          _debug: { arcScanError: String(err), creationBlock, ...debugInfo },
        });
      }
      throw err;
    }

    if (debug && logs.length === 0) {
      // Try without topic filter to see if ANY logs exist
      let rawLogs: BlockscoutLog[] = [];
      try {
        const params = new URLSearchParams({
          module:  "logs",
          action:  "getLogs",
          address: curveAddress,
          toBlock: "latest",
        });
        if (creationBlock !== null) params.set("fromBlock", String(creationBlock));
        const res = await fetch(`${ARCSCAN_API}?${params}`, { headers: { Accept: "application/json" } });
        const json: BlockscoutResponse = await res.json();
        rawLogs = Array.isArray(json.result) ? json.result : [];
      } catch { /* ignore */ }

      return NextResponse.json({
        trades: [],
        _debug: {
          creationBlock,
          logsWithTopicFilter: 0,
          rawLogsCount: rawLogs.length,
          rawLogTopics: rawLogs.slice(0, 5).map(l => ({
            topic0: l.topics[0],
            blockNumber: l.blockNumber,
            txHash: l.transactionHash,
          })),
          ...debugInfo,
        },
      });
    }

    // ── Decode and build trade list ────────────────────────────────────────
    type Trade = {
      timestamp: number;
      isBuy:     boolean;
      usdcAmt:   number;
      tokenAmt:  number;
      price:     number;
      txHash:    string;
    };

    const trades: Trade[] = logs
      .filter(l => l.data && l.data !== "0x")
      .map(l => {
        try {
          const decoded  = decodeAbiParameters(TRADE_DATA_PARAMS, l.data as `0x${string}`);
          const isBuy    = Boolean(decoded[0]);
          const usdcRaw  = decoded[1] as bigint;
          const tokRaw   = decoded[2] as bigint;
          const usdcAmt  = Number(usdcRaw) / 1e6;
          const tokenAmt = Number(tokRaw)  / 1e18;
          const price    = tokRaw > 0n ? Number(usdcRaw * 10n ** 12n / tokRaw) / 1e12 : 0;
          const timestamp = hexOrDecToNumber(l.timeStamp);
          return {
            timestamp,
            isBuy,
            usdcAmt,
            tokenAmt,
            price,
            txHash: l.transactionHash ?? "",
          };
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

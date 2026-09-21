/**
 * GET /api/launchpad/arc-trades?curveAddress=0x...&limit=500
 *
 * Récupère les événements Trade de BondingCurveArcV2.
 * Utilise l'API ArcScan (Blockscout) au lieu de eth_getLogs.
 *
 * Event V2 :
 *   Trade(address indexed trader, bool isBuy, uint256 usdcAmount, uint256 tokenAmount,
 *         uint256 fee, uint256 realUsdcRaised, uint256 reserveUsdc, uint256 reserveTokens)
 *
 * USDC Arc = natif 18 decimals.
 */

import { NextResponse } from "next/server";
import { decodeAbiParameters, parseAbiParameters } from "viem";
import { createAdminClient } from "@/lib/supabase/server";
import { TRADE_EVENT_TOPIC } from "@/lib/arc-launchpad";

export const maxDuration = 60;

const ARCSCAN_API = "https://explorer.arc.io/api";

// ABI des paramètres non-indexés V2
// trader est indexed → pas dans data
// isBuy, usdcAmount, tokenAmount, fee, realUsdcRaised, reserveUsdc, reserveTokens dans data
const TRADE_DATA_PARAMS_V2 = parseAbiParameters(
  "bool isBuy, uint256 usdcAmount, uint256 tokenAmount, uint256 fee, uint256 realUsdcRaised, uint256 reserveUsdc, uint256 reserveTokens"
);

type BlockscoutLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  timeStamp: string;
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
  topic0?: string,
): Promise<BlockscoutLog[]> {
  // Récupère sans topic0 (beaucoup d'instances Blockscout ignorent ce filtre)
  // et filtre topic0 côté serveur.
  const params = new URLSearchParams({
    module:  "logs",
    action:  "getLogs",
    address,
    toBlock: String(toBlock),
  });
  if (fromBlock !== null) params.set("fromBlock", String(fromBlock));

  const url = `${ARCSCAN_API}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { "Accept": "application/json" },
    // Pas de revalidate — on veut les trades en temps quasi-réel
    cache: "no-store",
  });

  if (res.status === 429) return [];
  if (!res.ok) throw new Error(`ArcScan API error: ${res.status} ${res.statusText}`);

  const json: BlockscoutResponse = await res.json();

  if (json.status !== "1") {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[arc-trades] ArcScan status 0:", json.message, json.result);
    }
    return [];
  }

  const all = Array.isArray(json.result) ? json.result : [];

  // Filtre topic0 côté serveur (robuste même si Blockscout l'ignore en query param)
  if (topic0) {
    return all.filter(l => l.topics?.[0]?.toLowerCase() === topic0.toLowerCase());
  }
  return all;
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

  type Trade = {
    timestamp: number;
    isBuy:     boolean;
    usdcAmt:   number;
    tokenAmt:  number;
    price:     number;
    txHash:    string;
  };

  try {
    // ── Lire le bloc de création depuis la DB ──────────────────────────────
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

    // ── Récupère les Trade events V2 depuis la curve standalone ───────────
    let logs: BlockscoutLog[];
    try {
      logs = await fetchLogsFromArcScan(curveAddress, creationBlock, "latest", TRADE_EVENT_TOPIC);
    } catch (err) {
      if (debug) {
        return NextResponse.json({
          trades: [],
          _debug: { arcScanError: String(err), creationBlock, TRADE_EVENT_TOPIC, ...debugInfo },
        });
      }
      throw err;
    }

    if (debug) {
      let rawLogs: BlockscoutLog[] = [];
      if (logs.length === 0) {
        try {
          const p = new URLSearchParams({ module: "logs", action: "getLogs", address: curveAddress, toBlock: "latest" });
          if (creationBlock !== null) p.set("fromBlock", String(creationBlock));
          const r = await fetch(`${ARCSCAN_API}?${p}`, { headers: { Accept: "application/json" } });
          const j: BlockscoutResponse = await r.json();
          rawLogs = Array.isArray(j.result) ? j.result : [];
        } catch { /* ignore */ }
      }
      return NextResponse.json({
        trades: [],
        _debug: {
          creationBlock, logsWithTopicFilter: logs.length,
          rawLogsCount: rawLogs.length,
          rawLogTopics: rawLogs.slice(0, 5).map(l => ({ topic0: l.topics[0], blockNumber: l.blockNumber, txHash: l.transactionHash })),
          TRADE_EVENT_TOPIC,
          ...debugInfo,
        },
      });
    }

    const trades: Trade[] = logs
      .filter(l => l.data && l.data !== "0x")
      .map(l => {
        try {
          const decoded  = decodeAbiParameters(TRADE_DATA_PARAMS_V2, l.data as `0x${string}`);
          const isBuy    = Boolean(decoded[0]);
          const usdcRaw  = decoded[1] as bigint;
          const tokRaw   = decoded[2] as bigint;
          // USDC Arc natif = 18 decimals
          const usdcAmt  = Number(usdcRaw) / 1e18;
          const tokenAmt = Number(tokRaw)  / 1e18;
          const price    = tokenAmt > 0 ? usdcAmt / tokenAmt : 0;
          return { timestamp: hexOrDecToNumber(l.timeStamp), isBuy, usdcAmt, tokenAmt, price, txHash: l.transactionHash ?? "" };
        } catch { return null; }
      })
      .filter((t): t is Trade => t !== null && t.price > 0)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-limit);

    return NextResponse.json({ trades }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });

  } catch (err) {
    console.error("[arc-trades]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

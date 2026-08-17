/**
 * GET /api/launchpad/trade-stats/[mint]
 *
 * Returns buy/sell transaction stats for the top pool of a Solana token,
 * across all GeckoTerminal timeframes (m5, h1, h6, h24).
 * No API key required.
 */
import { NextResponse } from "next/server";

type Tf = "m5" | "h1" | "h6" | "h24";

export type TfStats = {
  buys:    number | null;
  sells:   number | null;
  buyers:  number | null;  // unique buyers
  sellers: number | null;  // unique sellers
  volume:  number | null;  // total volume USD
};

export type TradeStatsResponse = Record<Tf, TfStats>;

type RouteParams = { params: Promise<{ mint: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { mint } = await params;
  if (!mint) return NextResponse.json({ error: "mint required" }, { status: 400 });

  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?limit=1`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 30 },
      }
    );

    if (!res.ok) return NextResponse.json({ error: "not found" }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool: any = json?.data?.[0]?.attributes;
    if (!pool) return NextResponse.json({ error: "no pool" }, { status: 404 });

    const result: TradeStatsResponse = {} as TradeStatsResponse;

    for (const tf of ["m5", "h1", "h6", "h24"] as Tf[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx: any  = pool.transactions?.[tf];
      const vol: string | undefined = pool.volume_usd?.[tf];

      result[tf] = {
        buys:    tx?.buys    != null ? Number(tx.buys)    : null,
        sells:   tx?.sells   != null ? Number(tx.sells)   : null,
        buyers:  tx?.buyers  != null ? Number(tx.buyers)  : null,
        sellers: tx?.sellers != null ? Number(tx.sellers) : null,
        volume:  vol         != null ? parseFloat(vol)    : null,
      };
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

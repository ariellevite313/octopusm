/**
 * GET /api/launchpad/platform-stats
 *
 * Returns aggregated platform metrics:
 *  - totalVolume : cumulative volume across all tokens (sum of volume_total_usd)
 *  - volume24h   : total 24h volume across all active tokens
 *  - tokenCount  : total tokens (excl. pending/cancelled)
 *  - graduatedCount : tokens with status = 'graduated'
 *  - earnedSol      : total creator fees claimed on Solana (SOL)
 *  - earnedArcUsdc  : total creator fees claimed on Arc (USDC)
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    const { data, error } = await admin
      .from("launchpad_tokens")
      .select("status, volume_total_usd, volume_24h_usd")
      .not("status", "in", "(pending,cancelled)");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as {
      status: string;
      volume_total_usd: number | null;
      volume_24h_usd: number | null;
    }[];

    const totalVolume    = rows.reduce((s, r) => s + (r.volume_total_usd ?? 0), 0);
    const volume24h      = rows.reduce((s, r) => s + (r.volume_24h_usd  ?? 0), 0);
    const tokenCount     = rows.length;
    const graduatedCount = rows.filter(r => r.status === "graduated").length;

    // Creator fees claimed on the platform (Solana in SOL, Arc in USDC)
    const { data: claims } = await admin
      .from("creator_fee_claims")
      .select("chain, amount_sol, amount_usdc");

    let earnedSol = 0;
    let earnedArcUsdc = 0;
    for (const c of (claims ?? []) as { chain: string | null; amount_sol: number | null; amount_usdc: number | null }[]) {
      if (c.chain === "arc") earnedArcUsdc += Number(c.amount_usdc ?? 0);
      else earnedSol += Number(c.amount_sol ?? 0);
    }

    return NextResponse.json({ totalVolume, volume24h, tokenCount, graduatedCount, earnedSol, earnedArcUsdc });
  } catch (err) {
    console.error("[platform-stats] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

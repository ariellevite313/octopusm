/**
 * GET /api/cron/arc-graduation
 *
 * Synchronise le statut de graduation en DB pour les tokens Arc V2.
 *
 * En V2, la graduation est AUTOMATIQUE — déclenchée on-chain dans buy()
 * quand realUsdcRaised >= GRAD_THRESHOLD. Il n'y a pas de tx keeper nécessaire.
 *
 * Ce cron lit simplement BondingCurveArcV2.graduated() pour chaque token actif
 * et met à jour la colonne `status` en DB ('active' → 'graduated').
 *
 * Variables d'env :
 *   CRON_SECRET — bearer token optionnel
 *
 * Vercel cron : toutes les 2 minutes.
 */

import { NextResponse }      from "next/server";
import { createPublicClient, http } from "viem";
import { arc }               from "@/lib/arc-chain";
import { BONDING_CURVE_V2_ABI } from "@/lib/arc-launchpad";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const RPC = "https://rpc.mainnet.arc.io";
const TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T | null> {
  return Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Récupérer les tokens actifs (pas encore marqués graduated en DB)
    const { data: tokens, error } = await admin
      .from("launchpad_tokens")
      .select("id, arc_launch_id")
      .eq("chain", "arc")
      .in("status", ["active", "graduating"])
      .not("arc_launch_id", "is", null);

    if (error) throw error;
    if (!tokens?.length) return NextResponse.json({ processed: 0 });

    const publicClient = createPublicClient({ chain: arc, transport: http(RPC) });

    type TokenRow = { id: string; arc_launch_id: string };
    const results: { id: string; graduated: boolean; error?: string }[] = [];

    await Promise.all((tokens as TokenRow[]).map(async (t) => {
      try {
        const curveAddr = t.arc_launch_id as `0x${string}`;
        const graduated = await withTimeout(
          publicClient.readContract({
            address: curveAddr,
            abi:     BONDING_CURVE_V2_ABI,
            functionName: "graduated",
          }) as Promise<boolean>
        );

        if (graduated === true) {
          await admin
            .from("launchpad_tokens")
            .update({ status: "graduated" })
            .eq("id", t.id);
          results.push({ id: t.id, graduated: true });
          console.log(`[arc-graduation] Synced graduated: ${curveAddr}`);
        } else {
          results.push({ id: t.id, graduated: false });
        }
      } catch (e) {
        results.push({ id: t.id, graduated: false, error: String(e) });
      }
    }));

    const newlyGraduated = results.filter(r => r.graduated).length;
    console.log(`[arc-graduation] newly_graduated=${newlyGraduated}/${tokens.length}`);
    return NextResponse.json({ newlyGraduated, total: tokens.length, results });

  } catch (err) {
    console.error("[arc-graduation]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

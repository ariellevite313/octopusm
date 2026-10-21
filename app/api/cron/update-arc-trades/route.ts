/**
 * GET /api/cron/update-arc-trades — à lancer chaque minute ou toutes les 2 minutes.
 * Met à jour les trades de tous les tokens Arc V2 (et rattrape l'historique des anciens, par tranches).
 * Sécurisé par CRON_SECRET (bearer, optionnel).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncCurveTrades } from "@/lib/arc-trades";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: tokens } = await db
    .from("launchpad_tokens").select("arc_launch_id, mint_address")
    .eq("chain", "arc").in("status", ["active", "graduating", "graduated"]).not("arc_launch_id", "is", null);
  const curves = ((tokens ?? []) as { arc_launch_id: string; mint_address: string | null }[])
    .filter((t) => /^0x[0-9a-fA-F]{40}$/.test(t.arc_launch_id) && t.arc_launch_id.toLowerCase() !== (t.mint_address ?? "").toLowerCase())
    .map((t) => t.arc_launch_id);
  const started = Date.now();
  let synced = 0, pending = 0, failed = 0;
  for (const c of curves) {
    if (Date.now() - started > 50_000) { pending++; continue; }
    try { (await syncCurveTrades(c, 150, db)) ? synced++ : pending++; } catch { failed++; }
  }
  return NextResponse.json({ curves: curves.length, synced, pending, failed });
}

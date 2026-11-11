/** GET /api/terminal/top-traders : ceux qui ont le plus gagné sur OM, en $ (chill, frais créateur, prédictions ; OMERO exclu). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfiles } from "@/lib/profiles";
import { loadEarnerRows, rankEarners } from "@/lib/top-earners";

export const dynamic = "force-dynamic";
let cache: { at: number; v: unknown } | null = null;

async function solUsd(): Promise<number> {
  try {
    const r = await fetch("https://api.coinbase.com/v2/prices/SOL-USD/spot", { signal: AbortSignal.timeout(4000) });
    return Number(((await r.json()) as { data?: { amount?: string } }).data?.amount) || 0;
  } catch { return 0; }
}

export async function GET() {
  if (cache && Date.now() - cache.at < 5 * 60_000) return NextResponse.json(cache.v);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const top = rankEarners(await loadEarnerRows(db, await solUsd()).catch(() => []), 10);
  const prof = await getProfiles(db, top.map((t) => t.wallet)).catch(() => new Map());
  const v = { traders: top.map((t) => ({ wallet: t.wallet, usd: Math.round(t.usd * 100) / 100, parts: t.parts, name: prof.get(t.wallet)?.name ?? null, avatar: prof.get(t.wallet)?.avatar_src ?? null })) };
  cache = { at: Date.now(), v };
  return NextResponse.json(v);
}

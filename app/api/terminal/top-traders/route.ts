/** GET /api/terminal/top-traders : les portefeuilles qui ont le plus tradé via OM sur 7 jours (volume en $). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfiles } from "@/lib/profiles";

export const dynamic = "force-dynamic";
let cache: { at: number; v: unknown } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < 120_000) return NextResponse.json(cache.v);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data } = await db.from("swaps").select("wallet, volume_usd").gte("created_at", since).not("volume_usd", "is", null).limit(5000);
  const sum = new Map<string, number>();
  for (const r of (data ?? []) as { wallet: string; volume_usd: number }[]) sum.set(r.wallet, (sum.get(r.wallet) ?? 0) + Number(r.volume_usd));
  const top = [...sum.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const prof = await getProfiles(db, top.map(([w]) => w)).catch(() => new Map());
  const v = { traders: top.map(([wallet, volume]) => ({ wallet, volume, name: prof.get(wallet)?.name ?? null, avatar: prof.get(wallet)?.avatar_src ?? null })) };
  cache = { at: Date.now(), v };
  return NextResponse.json(v);
}

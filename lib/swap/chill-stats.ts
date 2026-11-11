/** Gains « Chill ton sac » : classement et total par portefeuille (table swaps). */
import { getProfiles } from "@/lib/profiles";

const SPAN: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30, "1y": 365 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function chillLeaderboard(db: any, period: string) {
  let q = db.from("swaps").select("ref_wallet, ref_usd").not("ref_wallet", "is", null).limit(20_000);
  if (SPAN[period]) q = q.gte("created_at", new Date(Date.now() - SPAN[period] * 86400_000).toISOString());
  const { data } = await q;
  const agg = new Map<string, { usd: number; trades: number }>();
  for (const r of (data ?? []) as { ref_wallet: string; ref_usd: number | null }[]) {
    const a = agg.get(r.ref_wallet) ?? { usd: 0, trades: 0 };
    a.usd += Number(r.ref_usd ?? 0); a.trades += 1;
    agg.set(r.ref_wallet, a);
  }
  const top = [...agg.entries()].sort((a, b) => b[1].usd - a[1].usd).slice(0, 100);
  const prof = await getProfiles(db, top.map(([w]) => w)).catch(() => new Map());
  return top.map(([wallet, a], i) => ({ rank: i + 1, wallet, usd: a.usd, trades: a.trades, name: prof.get(wallet)?.name ?? null, avatar: prof.get(wallet)?.avatar_src ?? null }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function chillEarnings(db: any, wallet: string): Promise<{ usd: number; trades: number }> {
  const { data } = await db.from("swaps").select("ref_usd").eq("ref_wallet", wallet).limit(20_000);
  const rows = (data ?? []) as { ref_usd: number | null }[];
  return { usd: rows.reduce((s, r) => s + Number(r.ref_usd ?? 0), 0), trades: rows.length };
}

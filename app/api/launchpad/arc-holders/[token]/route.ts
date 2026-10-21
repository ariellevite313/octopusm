/**
 * GET /api/launchpad/arc-holders/[token]?curve=0x…
 * Top 100 holders d'un token ERC-20 sur Arc, avec le nombre exact de holders et le nom OMdotfun des holders qui ont un profil.
 * 1) notre base (table arc_holdings, tenue à jour par le cron update-arc-holdings) — liste et nombre exacts
 * 2) repli : API ArcScan getTokenHolders, puis reconstruction depuis les events Transfer.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { arcBalances, TOP_HOLDERS, withProfiles } from "@/lib/holders";

export const revalidate = 60;

const ARCSCAN_API = "https://explorer.arc.io/api";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO = "0x0000000000000000000000000000000000000000";
const TOTAL_SUPPLY = 1_000_000_000;

type Row = { owner: string; raw: bigint };

async function viaHolderApi(token: string): Promise<{ rows: Row[]; total: number | null } | null> {
  const p = new URLSearchParams({ module: "token", action: "getTokenHolders", contractaddress: token, page: "1", offset: "100" });
  const res = await fetch(`${ARCSCAN_API}?${p}`, { headers: { Accept: "application/json" }, next: { revalidate: 60 }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const j = (await res.json()) as { status?: string; result?: unknown };
  if (!Array.isArray(j.result)) return null;
  const rows: Row[] = [];
  for (const r of j.result as { address?: string; TokenHolderAddress?: string; value?: string; TokenHolderQuantity?: string }[]) {
    const owner = (r.address ?? r.TokenHolderAddress ?? "").toLowerCase();
    const v = r.value ?? r.TokenHolderQuantity ?? "0";
    if (ADDR_RE.test(owner) && /^\d+$/.test(v)) rows.push({ owner, raw: BigInt(v) });
  }
  return rows.length ? { rows, total: null } : null;
}

async function viaTransfers(token: string): Promise<{ rows: Row[]; total: number } | null> {
  const p = new URLSearchParams({ module: "logs", action: "getLogs", address: token, topic0: TRANSFER_TOPIC, fromBlock: "0", toBlock: "latest" });
  const res = await fetch(`${ARCSCAN_API}?${p}`, { headers: { Accept: "application/json" }, next: { revalidate: 60 }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const j = (await res.json()) as { result?: unknown };
  if (!Array.isArray(j.result)) return null;
  const bal = new Map<string, bigint>();
  const addr = (t: string) => ("0x" + t.slice(-40)).toLowerCase();
  for (const l of j.result as { topics: string[]; data: string }[]) {
    if (l.topics?.length < 3) continue;
    const from = addr(l.topics[1]), to = addr(l.topics[2]);
    const v = BigInt(l.data && l.data !== "0x" ? l.data : "0x0");
    if (from !== ZERO) bal.set(from, (bal.get(from) ?? BigInt(0)) - v);
    if (to !== ZERO) bal.set(to, (bal.get(to) ?? BigInt(0)) + v);
  }
  const rows = [...bal.entries()].filter(([, v]) => v > BigInt(0)).map(([owner, raw]) => ({ owner, raw }));
  return { rows, total: rows.length };
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const curve = (new URL(req.url).searchParams.get("curve") ?? "").toLowerCase();
  if (!ADDR_RE.test(token)) return NextResponse.json({ error: "invalid token" }, { status: 400 });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    let res: { rows: Row[]; total: number | null } | null = null;
    try {
      const fromDb = await arcBalances(db, token);
      if (fromDb && fromDb.length) res = { rows: fromDb, total: fromDb.length };
    } catch { /* repli */ }
    if (!res) { try { res = await viaHolderApi(token); } catch { /* repli */ } }
    if (!res) res = await viaTransfers(token);
    if (!res) return NextResponse.json({ error: "unavailable" }, { status: 502 });

    const rows = res.rows.filter((r) => r.raw > BigInt(0)).sort((a, b) => (b.raw > a.raw ? 1 : b.raw < a.raw ? -1 : 0));
    const top = rows.slice(0, TOP_HOLDERS).map((r, i) => {
      const amount = Number(r.raw) / 1e18;
      return {
        rank: i + 1,
        owner: r.owner,
        amount,
        pct: (amount / TOTAL_SUPPLY) * 100,
        isProgram: !!curve && r.owner === curve,
      };
    });
    const holders = await withProfiles(db, top);
    return NextResponse.json({ holders, total: res.total ?? rows.length }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}

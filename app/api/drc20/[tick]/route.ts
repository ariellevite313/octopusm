/** GET /api/drc20/[tick] — un token DRC-20 : chiffres, 100 plus gros holders, 50 derniers mouvements. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { drcPct } from "@/lib/drc20";

export const revalidate = 30;

export async function GET(_req: Request, { params }: { params: Promise<{ tick: string }> }) {
  const tick = decodeURIComponent((await params).tick).toLowerCase();
  if ([...tick].length !== 4) return NextResponse.json({ error: "invalid tick" }, { status: 400 });
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const [t, h, e] = await Promise.all([
      db.from("drc20_tokens").select("tick, max_supply, lim, dec, minted, holders, deployer, inscription, height").eq("tick", tick).maybeSingle(),
      db.from("drc20_balances").select("address, avail, trans").eq("tick", tick).order("avail", { ascending: false }).limit(100),
      db.from("drc20_events").select("height, txid, kind, from_addr, to_addr, amt").eq("tick", tick).order("id", { ascending: false }).limit(50),
    ]);
    const r = t.data as Record<string, string | number> | null;
    if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });
    const token = { tick: String(r.tick), max: String(r.max_supply), lim: String(r.lim), dec: Number(r.dec), minted: String(r.minted), holders: Number(r.holders), deployer: String(r.deployer), inscription: String(r.inscription), height: Number(r.height), progress: drcPct(String(r.minted), String(r.max_supply)) };
    const holders = ((h.data ?? []) as { address: string; avail: string; trans: string }[]).map((x) => {
      const amount = (BigInt(String(x.avail).split(".")[0]) + BigInt(String(x.trans).split(".")[0])).toString();
      return { address: x.address, amount, pct: drcPct(amount, token.minted) };
    });
    const events = ((e.data ?? []) as { height: number; txid: string; kind: string; from_addr: string | null; to_addr: string | null; amt: string }[]).map((x) => ({ height: x.height, txid: x.txid, kind: x.kind, from: x.from_addr, to: x.to_addr, amt: String(x.amt) }));
    return NextResponse.json({ token, holders, events }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}

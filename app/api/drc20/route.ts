/** GET /api/drc20?sort=holders|new|progress&q=… — tokens DRC-20 indexés (Dogecoin). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { drcPct, type Drc20Token } from "@/lib/drc20";

export const revalidate = 30;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const sort = u.searchParams.get("sort") ?? "holders";
  const q = (u.searchParams.get("q") ?? "").trim().toLowerCase().replace(/[^\p{L}\p{N}$._-]/gu, "").slice(0, 8);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    let qy = db.from("drc20_tokens").select("tick, max_supply, lim, dec, minted, holders, deployer, inscription, height").limit(200);
    if (q) qy = qy.ilike("tick", `%${q}%`);
    qy = sort === "new" ? qy.order("height", { ascending: false }) : qy.order("holders", { ascending: false });
    const [{ data, error }, st] = await Promise.all([qy, db.from("drc20_state").select("height, updated_at").eq("id", 1).maybeSingle()]);
    if (error) throw new Error(error.message);
    let tokens: Drc20Token[] = ((data ?? []) as Record<string, string | number>[]).map((r) => ({
      tick: String(r.tick), max: String(r.max_supply), lim: String(r.lim), dec: Number(r.dec), minted: String(r.minted), holders: Number(r.holders),
      deployer: String(r.deployer), inscription: String(r.inscription), height: Number(r.height), progress: drcPct(String(r.minted), String(r.max_supply)),
    }));
    if (sort === "progress") tokens = tokens.sort((a, b) => b.progress - a.progress);
    return NextResponse.json({ tokens, indexed: st?.data?.height ?? null, updated: st?.data?.updated_at ?? null }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch {
    return NextResponse.json({ tokens: [], indexed: null, updated: null });
  }
}

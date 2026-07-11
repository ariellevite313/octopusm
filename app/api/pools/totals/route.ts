import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids");
  if (!ids) return NextResponse.json({});

  const uuids = ids.split(",").slice(0, 50).filter(id =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );
  if (uuids.length === 0) return NextResponse.json({});

  const supabase = createAdminClient() as any;
  const { data, error } = await supabase
    .from("mutuel_bets")
    .select("market_id, option_id, amount, token")
    .in("market_id", uuids)
    .eq("status", "approved");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate: sum USDC-equivalent amount per (market, option)
  const result: Record<string, Record<string, number>> = {};
  for (const row of data ?? []) {
    const mId: string = row.market_id;
    const oId: string = row.option_id;
    const amt: number = row.token === "usdc" ? Number(row.amount) : Number(row.amount) / 500_000;
    if (!result[mId]) result[mId] = {};
    result[mId][oId] = (result[mId][oId] ?? 0) + amt;
  }

  return NextResponse.json(result);
}

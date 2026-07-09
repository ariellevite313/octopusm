import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wallet = url.searchParams.get("wallet");

  if (!wallet || typeof wallet !== "string")
    return NextResponse.json({ error: "wallet required" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from("mutuel_markets")
    .select("*")
    .eq("creator_wallet", wallet)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

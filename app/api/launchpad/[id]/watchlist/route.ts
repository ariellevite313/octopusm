import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireSessionWallet } from "@/lib/social/session";

type RouteParams = { params: Promise<{ id: string }> };

// GET — check if a wallet is watching
export async function GET(req: Request, { params }: RouteParams) {
  try {
  const { id } = await params;
  const wallet = new URL(req.url).searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ watching: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("launchpad_watchlist")
    .select("id")
    .eq("token_id", id)
    .eq("wallet", wallet)
    .maybeSingle();

  return NextResponse.json({ watching: !!data });
  } catch (err) {
    console.error("[watchlist] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — toggle watchlist
export async function POST(_req: Request, { params }: RouteParams) {
  try {
  const { id } = await params;
  const s = await requireSessionWallet();
  if ("error" in s) return s.error;
  const wallet = s.wallet;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: existing } = await admin
    .from("launchpad_watchlist")
    .select("id")
    .eq("token_id", id)
    .eq("wallet", wallet)
    .maybeSingle();

  if (existing) {
    await admin.from("launchpad_watchlist").delete().eq("id", existing.id);
    return NextResponse.json({ watching: false });
  } else {
    await admin.from("launchpad_watchlist").insert({ token_id: id, wallet });
    return NextResponse.json({ watching: true });
  }
  } catch (err) {
    console.error("[watchlist] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

// GET — check if a wallet is watching
export async function GET(req: Request, { params }: RouteParams) {
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
}

// POST — toggle watchlist
export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const { wallet } = await req.json() as { wallet?: string };
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

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
}

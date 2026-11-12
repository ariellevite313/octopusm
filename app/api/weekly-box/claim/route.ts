/**
 * POST /api/weekly-box/claim { week } : le gagnant réclame sa box SOL.
 * La demande part dans la file admin ; l'équipe paie à la main puis la marque payée.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";

export async function POST(req: Request) {
  const wallet = await getWalletAddress();
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { week?: unknown };
  const week = typeof body.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.week) ? body.week : null;
  if (!week) return NextResponse.json({ error: "Invalid week" }, { status: 400 });

   
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc("claim_weekly_box", { p_week: week, p_wallet: wallet });
  if (error) return NextResponse.json({ error: "Could not claim right now" }, { status: 500 });
  if (data === "not_winner") return NextResponse.json({ error: "This box is not yours" }, { status: 403 });
  if (data === "none") return NextResponse.json({ error: "Nothing to claim" }, { status: 409 });
  return NextResponse.json({ ok: true, status: data });
}

/**
 * POST /api/admin/weekly-box { week, paid_tx } : marque la box SOL du gagnant comme payée.
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";

export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { week?: unknown; paid_tx?: unknown };
  const week = typeof body.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.week) ? body.week : null;
  const tx = typeof body.paid_tx === "string" ? body.paid_tx.trim().slice(0, 200) : "";
  if (!week) return NextResponse.json({ error: "Invalid week" }, { status: 400 });
  if (!tx) return NextResponse.json({ error: "Transaction signature required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin.from("weekly_box_weeks")
    .update({ prize_status: "paid", paid_at: new Date().toISOString(), paid_tx: tx, paid_by: await getWalletAddress() })
    .eq("week_start", week).in("prize_status", ["won", "claimed"]).select("week_start");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Nothing to pay for this week" }, { status: 409 });
  return NextResponse.json({ ok: true });
}

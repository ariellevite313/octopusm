import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("withdrawal_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ withdrawals: data ?? [] });
}

export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  let body: { action: string; id: string; reason?: string; paid_tx?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { action, id, reason, paid_tx } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  const adminWallet: string | null = user?.user_metadata?.wallet_address ?? null;

  const admin = createAdminClient() as any;
  const now = new Date().toISOString();

  if (action === "approve") {
    const { data: updated, error } = await admin
      .from("withdrawal_requests")
      .update({ status: "approved", reviewed_by: adminWallet, reviewed_at: now })
      .eq("id", id)
      .eq("status", "pending")
      .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated || updated.length === 0)
      return NextResponse.json({ error: "Request not found or not pending" }, { status: 409 });

    return NextResponse.json({ ok: true });
  }

  if (action === "reject") {
    const { data: updated, error } = await admin
      .from("withdrawal_requests")
      .update({
        status: "rejected",
        reviewed_by: adminWallet,
        reviewed_at: now,
        rejection_reason: reason ?? null,
      })
      .eq("id", id)
      .in("status", ["pending", "approved"])
      .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated || updated.length === 0)
      return NextResponse.json({ error: "Request not found or already processed" }, { status: 409 });

    return NextResponse.json({ ok: true });
  }

  if (action === "mark_paid") {
    const { data: updated, error } = await admin
      .from("withdrawal_requests")
      .update({
        status: "paid",
        paid_tx: paid_tx ?? null,
        paid_at: now,
        reviewed_by: adminWallet,
        reviewed_at: now,
      })
      .eq("id", id)
      .eq("status", "approved")
      .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated || updated.length === 0)
      return NextResponse.json({ error: "Request not found or not approved" }, { status: 409 });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

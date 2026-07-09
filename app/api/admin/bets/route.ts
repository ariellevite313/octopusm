import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.rpc("is_admin");
  return !!data;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  if (!(await isAdmin(supabase)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { betId, action } = await req.json();

  if (!betId || !["approve", "reject"].includes(action))
    return NextResponse.json({ error: "betId and action required" }, { status: 400 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const adminWallet = user?.user_metadata?.wallet_address ?? null;
  const now = new Date().toISOString();

  // Update prediction_history admin_decision_status
  const newStatus = action === "approve" ? "approved" : "rejected";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("prediction_history")
    .update({
      admin_decision_status: newStatus,
      updated_at: now,
    })
    .eq("id", betId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

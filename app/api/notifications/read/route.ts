import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";

/** POST /api/notifications/read → marks all of the caller's notifications as read */
export async function POST() {
  const me = await getWalletAddress();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const wallet = me.startsWith("0x") ? me.toLowerCase() : me;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("wallet", wallet).is("read_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

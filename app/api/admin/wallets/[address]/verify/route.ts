/**
 * POST /api/admin/wallets/[address]/verify
 *
 * Toggles is_creator_verified on a wallet.
 * Body: { verified: boolean }
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ address: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { address } = await params;
  const body = await req.json() as { verified: boolean };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin
    .from("wallets")
    .update({ is_creator_verified: body.verified })
    .eq("address", address);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, verified: body.verified });
  } catch (err) {
    console.error("[verify] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

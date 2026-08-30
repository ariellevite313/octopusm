/**
 * POST /api/admin/launchpad/[id]/verify
 * Body: { verified: boolean }
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { id } = await params;
  const { verified } = await req.json() as { verified: boolean };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: token, error: fetchError } = await admin
    .from("launchpad_tokens")
    .select("mint_address")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin
    .from("launchpad_tokens")
    .update({ is_verified: verified })
    .eq("id", id);

  if (fetchError || error) {
    return NextResponse.json({ error: (error ?? fetchError).message }, { status: 500 });
  }

  // Invalidate ISR cache immediately so the badge appears/disappears at once
  revalidatePath("/launchpad");
  revalidatePath(`/launchpad/${id}`);
  if (token?.mint_address) {
    revalidatePath(`/launchpad/${token.mint_address as string}`);
  }

  return NextResponse.json({ success: true, verified });
  } catch (err) {
    console.error("[verify] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

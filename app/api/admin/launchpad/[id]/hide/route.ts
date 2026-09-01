/**
 * POST /api/admin/launchpad/[id]/hide
 * Body: { hidden: boolean }
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
    const { hidden } = await req.json() as { hidden: boolean };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    const { error } = await admin
      .from("launchpad_tokens")
      .update({ is_hidden: hidden })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidatePath("/launchpad");
    revalidatePath(`/launchpad/${id}`);

    return NextResponse.json({ success: true, hidden });
  } catch (err) {
    console.error("[hide] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

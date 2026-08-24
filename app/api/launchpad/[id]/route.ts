/**
 * DELETE /api/launchpad/[id]
 *
 * Permanently deletes a cancelled launchpad token from the DB.
 * Admin-only. Token must have status = 'cancelled'.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth/require-admin";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;

  const denied = await requireAdminApi();
  if (denied) return denied;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    const { data: token, error: fetchError } = await admin
      .from("launchpad_tokens")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    if ((token.status as string) !== "cancelled") {
      return NextResponse.json(
        { error: "Only cancelled tokens can be deleted" },
        { status: 409 },
      );
    }

    const { error: deleteError } = await admin
      .from("launchpad_tokens")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("launchpad DELETE error:", deleteError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("launchpad DELETE unexpected error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

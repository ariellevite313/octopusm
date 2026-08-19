/**
 * DELETE /api/launchpad/[id]
 *
 * Permanently deletes a cancelled launchpad token from the DB.
 * Only the creator (session wallet) can delete, and only when status = 'cancelled'.
 *
 * Body: { walletAddress: string }
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    // Verify session wallet
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: { user } } = await (supabase as any).auth.getUser();
    const sessionWallet: string | null = user?.user_metadata?.wallet_address ?? null;

    if (!sessionWallet) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Fetch the token to verify ownership and status
    const { data: token, error: fetchError } = await admin
      .from("launchpad_tokens")
      .select("id, creator_wallet, status")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    if ((token.creator_wallet as string) !== sessionWallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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

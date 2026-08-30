/**
 * GET /api/launchpad/[id]/status
 *
 * Returns the current status of a pending token launch.
 * The frontend polls this while waiting for vanity address generation.
 *
 * Response:
 *   { status, mintAddress, vanityReady, isScheduled, scheduledAt }
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data, error } = await admin
      .from("launchpad_tokens")
      .select("id, status, mint_address, is_scheduled, scheduled_at, is_tradeable")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    return NextResponse.json({
      status:       data.status,
      mintAddress:  data.mint_address ?? null,
      vanityReady:  !!data.mint_address,
      isScheduled:  data.is_scheduled,
      scheduledAt:  data.scheduled_at ?? null,
      isTradeable:  data.is_tradeable,
    });
  } catch (err) {
    console.error("[status] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

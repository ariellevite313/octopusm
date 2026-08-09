/**
 * GET  /api/admin/launchpad   — list all launchpad tokens (max 500)
 * POST /api/admin/launchpad   — moderation actions
 *
 * Actions:
 *   { action: "cancel", tokenId }  — set status to "cancelled"
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data, error } = await admin
    .from("launchpad_tokens")
    .select(
      "id, name, ticker, category, status, is_tradeable, is_scheduled, scheduled_at, " +
      "mint_address, pool_address, creator_wallet, supply, vanity_job_id, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[admin] launchpad GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tokens: data ?? [] });
}

export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  let body: { action?: string; tokenId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, tokenId } = body;
  if (!tokenId) {
    return NextResponse.json({ error: "tokenId is required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // ── Cancel ──────────────────────────────────────────────────────────────────
  if (action === "cancel") {
    const { error, count } = await admin
      .from("launchpad_tokens")
      .update({ status: "cancelled", vanity_secret_key: null })
      .eq("id", tokenId)
      .neq("status", "graduated")
      .neq("status", "cancelled")
      .select("id", { count: "exact", head: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!count || count === 0) {
      return NextResponse.json(
        { error: "Token not found or cannot be cancelled" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

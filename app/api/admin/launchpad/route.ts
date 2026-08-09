/**
 * GET  /api/admin/launchpad   — list all launchpad tokens (max 500)
 * POST /api/admin/launchpad   — moderation actions
 *
 * Actions:
 *   { action: "cancel",       tokenId }  — set status to "cancelled"
 *   { action: "retry-vanity", tokenId }  — claim a new keypair from the pool
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const [tokensRes, poolRes] = await Promise.all([
    admin
      .from("launchpad_tokens")
      .select(
        "id, name, ticker, category, status, is_tradeable, is_scheduled, scheduled_at, " +
        "mint_address, pool_address, creator_wallet, supply, vanity_job_id, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("vanity_keypair_pool")
      .select("id", { count: "exact", head: true })
      .is("assigned_token_id", null),
  ]);

  if (tokensRes.error) {
    console.error("[admin] launchpad GET error:", tokensRes.error);
    return NextResponse.json({ error: tokensRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    tokens:          tokensRes.data ?? [],
    poolAvailable:   poolRes.count  ?? 0,
  });
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

    // Also clear the secret from the pool entry
    await admin.rpc("clear_vanity_secret", { p_token_id: tokenId });

    return NextResponse.json({ ok: true });
  }

  // ── Retry vanity — claim a new keypair from the pool ─────────────────────────
  if (action === "retry-vanity") {
    // Verify token is still pending
    const { data: token, error: fetchErr } = await admin
      .from("launchpad_tokens")
      .select("id, status")
      .eq("id", tokenId)
      .eq("status", "pending")
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!token) {
      return NextResponse.json(
        { error: "Token not found or not in pending status" },
        { status: 404 }
      );
    }

    // Release the old pool keypair (if any) back to available.
    // 0 rows updated = token never had a keypair → not an error.
    const { error: releaseErr } = await admin
      .rpc("release_vanity_keypair_by_token", { p_token_id: tokenId });
    if (releaseErr) {
      console.error("[admin] release_vanity_keypair_by_token failed:", releaseErr.message);
      return NextResponse.json({ error: "Failed to release old keypair — retry again" }, { status: 500 });
    }

    // Claim a fresh keypair
    const { data: claimed, error: claimErr } = await admin
      .rpc("claim_vanity_keypair", { p_token_id: tokenId });

    if (claimErr || !claimed || claimed.length === 0) {
      return NextResponse.json(
        { error: "Pool is empty — run the generate-vanity-pool script first" },
        { status: 503 }
      );
    }

    const { pub_key, sec_key } = claimed[0] as { pub_key: string; sec_key: string };

    const { error: updateErr } = await admin
      .from("launchpad_tokens")
      .update({
        mint_address:      pub_key,
        vanity_secret_key: sec_key,
        vanity_job_id:     "done",
      })
      .eq("id", tokenId);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, mintAddress: pub_key });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

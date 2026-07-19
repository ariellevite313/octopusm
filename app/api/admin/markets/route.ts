import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";


export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  let body;

  try { body = await req.json(); }

  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { action, marketId } = body;

  // ── Create ──────────────────────────────────────────────────────────────────
  if (action === "create") {
    const {
      title,
      category_id,
      market_type,
      visual_type,
      resolution_label,
      resolution_criteria,
      event_start_at,
      options,
      left_competitor_name,
      left_competitor_image_src,
      right_competitor_name,
      right_competitor_image_src,
      single_name,
      single_image_src,
      price_ticker,
      price_target,
    } = body;

    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80)
      + "-" + Date.now().toString(36);

    const adminCreate = createAdminClient() as any;
    const { error } = await adminCreate.from("prediction_markets").insert({
      id: crypto.randomUUID(),
      slug,
      title,
      category_id: category_id ?? "other",
      market_type: market_type ?? "yes-no",
      visual_type: visual_type ?? "simple",
      resolution_label: resolution_label ?? title,
      resolution_criteria: resolution_criteria ?? null,
      event_start_at: event_start_at ?? null,
      options: options ?? [],
      left_competitor_name: left_competitor_name ?? null,
      left_competitor_image_src: left_competitor_image_src ?? null,
      right_competitor_name: right_competitor_name ?? null,
      right_competitor_image_src: right_competitor_image_src ?? null,
      single_name: single_name ?? null,
      single_image_src: single_image_src ?? null,
      price_ticker: price_ticker ?? null,
      price_target: price_target != null ? Number(price_target) : null,
      is_active: true,
      is_resolved: false,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidatePath("/");
    revalidatePath("/archive");
    return NextResponse.json({ ok: true });
  }

  // ── Resolve ──────────────────────────────────────────────────────────────────
  if (action === "resolve") {
    const { outcomeId } = body;
    if (!marketId || !outcomeId)
      return NextResponse.json({ error: "marketId and outcomeId required" }, { status: 400 });

    const now = new Date().toISOString();
    const admin = (await import("@/lib/supabase/server")).createAdminClient() as any;

    // 1. Mark the market as resolved
    const { error: marketErr } = await admin
      .from("prediction_markets")
      .update({ is_resolved: true, resolution_outcome_id: outcomeId, resolved_at: now })
      .eq("id", marketId);
    if (marketErr) return NextResponse.json({ error: marketErr.message }, { status: 500 });

    // 2. Propagate outcome to all approved prediction_history rows for this market
    //    This makes result_status compute correctly (win/lose) in the view
    const { error: histErr } = await admin
      .from("prediction_history")
      .update({ resolution_outcome_id: outcomeId, resolved_at: now })
      .eq("market_id", marketId)
      .not("admin_decision_status", "eq", "rejected");
    if (histErr) console.error("[resolve] prediction_history update:", histErr.message);
    revalidatePath("/");
    revalidatePath("/archive");
    return NextResponse.json({ ok: true });
  }

  // ── Toggle active ─────────────────────────────────────────────────────────────
  if (action === "toggle_active") {
    const { isActive } = body;
    if (!marketId) return NextResponse.json({ error: "marketId required" }, { status: 400 });
    const adminToggle = createAdminClient() as any;
    const { error } = await adminToggle
      .from("prediction_markets")
      .update({ is_active: isActive })
      .eq("id", marketId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidatePath("/");
    return NextResponse.json({ ok: true });
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  if (action === "delete") {
    if (!marketId) return NextResponse.json({ error: "marketId required" }, { status: 400 });
    const admin = (await import("@/lib/supabase/server")).createAdminClient() as any;

    // Delete dependent rows first to avoid FK constraint violations
    // 1. Get comment IDs to delete their likes first
    const { data: comments } = await admin.from("market_comments").select("id").eq("market_id", marketId);
    if (comments?.length) {
      const commentIds = comments.map((c: { id: string }) => c.id);
      await admin.from("market_comment_likes").delete().in("comment_id", commentIds);
    }
    await admin.from("market_comments").delete().eq("market_id", marketId);
    await admin.from("prediction_history").delete().eq("market_id", marketId);
    await admin.from("payments").delete().eq("market_id", marketId);

    const { error } = await admin.from("prediction_markets").delete().eq("id", marketId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidatePath("/");
       revalidatePath("/archive");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

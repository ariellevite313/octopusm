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

    // B-02 — Required fields
    if (!title || typeof title !== "string" || !title.trim())
      return NextResponse.json({ error: "title required" }, { status: 400 });

    // B-03 — Whitelists
    const VALID_MARKET_TYPES = ["yes-no", "threshold", "three-way"];
    const VALID_CATEGORIES   = ["sports", "crypto", "politics", "entertainment", "cinema", "science", "other"];
    const VALID_VISUAL_TYPES = ["simple", "vs"];
    const VALID_TICKERS      = ["", "BTCUSDT", "ETHUSDT", "SOLUSDT", null, undefined];

    if (market_type && !VALID_MARKET_TYPES.includes(market_type))
      return NextResponse.json({ error: "Invalid market_type" }, { status: 400 });
    if (category_id && !VALID_CATEGORIES.includes(category_id))
      return NextResponse.json({ error: "Invalid category_id" }, { status: 400 });
    if (visual_type && !VALID_VISUAL_TYPES.includes(visual_type))
      return NextResponse.json({ error: "Invalid visual_type" }, { status: 400 });
    if (!VALID_TICKERS.includes(price_ticker))
      return NextResponse.json({ error: "Invalid price_ticker" }, { status: 400 });

    // B-02 — Options validation
    if (!Array.isArray(options) || options.length < 2)
      return NextResponse.json({ error: "At least 2 options required" }, { status: 400 });
    for (const opt of options) {
      if (!opt?.label || typeof opt.label !== "string" || !opt.label.trim())
        return NextResponse.json({ error: "All options must have a non-empty label" }, { status: 400 });
      const mult = Number(opt.oddsMultiplier);
      if (!Number.isFinite(mult) || mult < 1)
        return NextResponse.json({ error: "oddsMultiplier must be ≥ 1" }, { status: 400 });
    }

    // B-01 — price_target: reject NaN/Infinity/negative
    let safeTarget: number | null = null;
    if (price_target != null && price_target !== "") {
      const parsed = Number(price_target);
      if (!Number.isFinite(parsed) || parsed < 0)
        return NextResponse.json({ error: "price_target must be a positive number" }, { status: 400 });
      safeTarget = parsed;
    }

    const slug = title.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80)
      + "-" + Date.now().toString(36);

    const adminCreate = createAdminClient() as any;
    const { error } = await adminCreate.from("prediction_markets").insert({
      id: crypto.randomUUID(),
      slug,
      title: title.trim().slice(0, 300),
      category_id: category_id ?? "other",
      market_type: market_type ?? "yes-no",
      visual_type: visual_type ?? "simple",
      resolution_label: (resolution_label?.trim() || title.trim()).slice(0, 300),
      resolution_criteria: resolution_criteria?.trim() || null,
      event_start_at: event_start_at ?? null,
      options: options.map((o: { id: string; label: string; oddsMultiplier: number }) => ({
        id: o.id,
        label: o.label.trim(),
        oddsMultiplier: Number(o.oddsMultiplier),
      })),
      left_competitor_name: left_competitor_name?.trim() || null,
      left_competitor_image_src: left_competitor_image_src?.trim() || null,
      right_competitor_name: right_competitor_name?.trim() || null,
      right_competitor_image_src: right_competitor_image_src?.trim() || null,
      single_name: single_name?.trim() || null,
      single_image_src: single_image_src?.trim() || null,
      price_ticker: price_ticker || null,
      price_target: safeTarget,
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

    // B-04 — Anti-double-resolve: only update if not already resolved
    const { data: updated, error: marketErr } = await admin
      .from("prediction_markets")
      .update({ is_resolved: true, resolution_outcome_id: outcomeId, resolved_at: now })
      .eq("id", marketId)
      .eq("is_resolved", false)   // atomic guard — skip if already resolved
      .select("id");
    if (marketErr) return NextResponse.json({ error: marketErr.message }, { status: 500 });
    if (!updated || updated.length === 0)
      return NextResponse.json({ error: "Market not found or already resolved" }, { status: 409 });

    // 2. Propagate outcome to all approved prediction_history rows for this market
    //    This makes result_status compute correctly (win/lose) in the view
    const { error: histErr } = await admin
      .from("prediction_history")
      .update({ resolution_outcome_id: outcomeId, resolved_at: now })
      .eq("market_id", marketId)
      .not("admin_decision_status", "eq", "rejected");
    if (histErr) console.error("[resolve] prediction_history update:", histErr.message);

    // 3. M5 fix: auto-reject any payments still "pending" for this market.
    //    They were never approved before resolution — they cannot produce a valid payout.
    const { error: pendingErr } = await admin
      .from("payments")
      .update({ status: "rejected", reviewed_at: now, reviewed_by_wallet: "system:auto-resolve" })
      .eq("market_id", marketId)
      .eq("flow", "prediction")
      .eq("status", "pending");
    if (pendingErr) console.error("[resolve] auto-reject pending payments:", pendingErr.message);

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

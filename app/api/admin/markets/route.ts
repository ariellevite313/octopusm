import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.rpc("is_admin");
  return !!data;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  if (!(await isAdmin(supabase)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
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
      event_date_label,
      event_start_at,
      options,
      left_competitor_name,
      left_competitor_image_src,
      right_competitor_name,
      right_competitor_image_src,
      single_name,
      single_image_src,
    } = body;

    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80)
      + "-" + Date.now().toString(36);

      const { error } = await (supabase as any).from("prediction_markets").insert({
      slug,
      title,
      category_id: category_id ?? "other",
      market_type: market_type ?? "yes-no",
      visual_type: visual_type ?? "simple",
      resolution_label: resolution_label ?? title,
      resolution_criteria: resolution_criteria ?? null,
      event_date_label: event_date_label ?? null,
      event_start_at: event_start_at ?? null,
      options: JSON.stringify(options ?? []),
      left_competitor_name: left_competitor_name ?? null,
      left_competitor_image_src: left_competitor_image_src ?? null,
      right_competitor_name: right_competitor_name ?? null,
      right_competitor_image_src: right_competitor_image_src ?? null,
      single_name: single_name ?? null,
      single_image_src: single_image_src ?? null,
      is_active: true,
      is_resolved: false,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Resolve ──────────────────────────────────────────────────────────────────
  if (action === "resolve") {
    const { outcomeId } = body;
    if (!marketId || !outcomeId)
      return NextResponse.json({ error: "marketId and outcomeId required" }, { status: 400 });
      const { error } = await (supabase as any)
      .from("prediction_markets")
      .update({ is_resolved: true, resolution_outcome_id: outcomeId, resolved_at: new Date().toISOString() })
      .eq("id", marketId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Toggle active ─────────────────────────────────────────────────────────────
  if (action === "toggle_active") {
    const { isActive } = body;
    if (!marketId) return NextResponse.json({ error: "marketId required" }, { status: 400 });
      const { error } = await (supabase as any)
      .from("prediction_markets")
      .update({ is_active: isActive })
      .eq("id", marketId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  if (action === "delete") {
    if (!marketId) return NextResponse.json({ error: "marketId required" }, { status: 400 });
      const { error } = await (supabase as any)
      .from("prediction_markets")
      .delete()
      .eq("id", marketId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

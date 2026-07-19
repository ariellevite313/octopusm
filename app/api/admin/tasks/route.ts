import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";


// POST /api/admin/tasks  — create or toggle a task
export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  let body;

  try { body = await req.json(); }

  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { action } = body;

  if (action === "create") {
    const { title, description, externalLink, rewardOcto, taskType, icon } = body;
    if (!title || !rewardOcto || !taskType)
      return NextResponse.json({ error: "title, rewardOcto, taskType required" }, { status: 400 });

    const admin = createAdminClient() as any;
    const { error } = await admin.from("tasks").insert({
      title,
      description: description ?? null,
      external_link: externalLink ?? null,
      reward_octo: Number(rewardOcto),
      task_type: taskType,
      icon: icon ?? null,
      is_active: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "toggle") {
    const { taskId, isActive } = body;
    if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });
    const admin = createAdminClient() as any;
    const { error } = await admin
      .from("tasks")
      .update({ is_active: isActive })
      .eq("id", taskId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const { taskId } = body;
    if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });
    const admin = createAdminClient() as any;
    const { error } = await admin.from("tasks").delete().eq("id", taskId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.rpc("is_admin");
  return !!data;
}

// POST /api/admin/tasks  — create or toggle a task
export async function POST(req: Request) {
  const supabase = await createClient();
  if (!(await isAdmin(supabase)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { action } = body;

  if (action === "create") {
    const { title, description, externalLink, rewardOcto, taskType, icon } = body;
    if (!title || !rewardOcto || !taskType)
      return NextResponse.json({ error: "title, rewardOcto, taskType required" }, { status: 400 });

    const { error } = await (supabase as any).from("tasks").insert({
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
    const { error } = await (supabase as any)
      .from("tasks")
      .update({ is_active: isActive })
      .eq("id", taskId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const { taskId } = body;
    if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });
    const { error } = await (supabase as any).from("tasks").delete().eq("id", taskId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

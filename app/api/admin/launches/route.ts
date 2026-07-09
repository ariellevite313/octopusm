import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.rpc("is_admin");
  return !!data;
}

// POST /api/admin/launches  — update launch status
export async function POST(req: Request) {
  const supabase = await createClient();
  if (!(await isAdmin(supabase)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { launchId, status } = body;

  if (!launchId || !["pending", "paid", "submitted", "rejected"].includes(status))
    return NextResponse.json({ error: "launchId and valid status required" }, { status: 400 });

  const { error } = await (supabase as any)
    .from("token_launches")
    .update({ status })
    .eq("id", launchId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

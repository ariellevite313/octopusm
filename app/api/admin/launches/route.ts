import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";

// POST /api/admin/launches  — update launch status
export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const body = await req.json();
  const { launchId, status } = body;

  if (!launchId || !["pending", "paid", "submitted", "rejected"].includes(status))
    return NextResponse.json({ error: "launchId and valid status required" }, { status: 400 });

  const admin = createAdminClient() as any;
  const { error } = await admin
    .from("token_launches")
    .update({ status })
    .eq("id", launchId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

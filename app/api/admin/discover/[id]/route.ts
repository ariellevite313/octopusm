/** POST /api/admin/discover/:id { action: "hide" | "restore" } : masquer ou remettre en ligne un projet Discover (les signalements sont traités). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth/require-admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action !== "hide" && action !== "restore") return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  await db.from("discover_apps").update({ status: action === "hide" ? "hidden" : "live" }).eq("id", id);
  await db.from("discover_reports").update({ status: "done" }).eq("app_id", id).eq("status", "open");
  return NextResponse.json({ ok: true });
}

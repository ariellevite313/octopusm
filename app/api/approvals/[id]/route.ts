/** POST /api/approvals/:id { action: "open" | "reject" } — suivi d'une proposition d'agent (aucun argent). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/social/posts";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action !== "open" && action !== "reject") return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("agent_intents")
    .update({ status: action === "open" ? "opened" : "rejected" })
    .eq("id", id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select("id");
  return NextResponse.json({ ok: true, updated: (data ?? []).length > 0 });
}

/** GET : applications connectées du wallet ; DELETE ?client_id= : couper l'accès de cette application. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";

export async function GET() {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin.from("oauth_tokens").select("client_id, scopes, created_at, last_used_at, refresh_expires_at").eq("wallet", s.wallet).eq("revoked", false).gt("refresh_expires_at", new Date().toISOString());
  const rows = (data ?? []) as { client_id: string; scopes: string[]; created_at: string; last_used_at: string | null }[];
  const ids = [...new Set(rows.map((r) => r.client_id))];
  const { data: clients } = ids.length ? await admin.from("oauth_clients").select("client_id, client_name").in("client_id", ids) : { data: [] };
  const names = new Map(((clients ?? []) as { client_id: string; client_name: string }[]).map((c) => [c.client_id, c.client_name]));
  const apps = new Map<string, { client_id: string; name: string; scopes: string[]; connected_at: string; last_used_at: string | null }>();
  for (const r of rows) {
    const cur = apps.get(r.client_id);
    if (!cur || r.created_at > cur.connected_at) apps.set(r.client_id, { client_id: r.client_id, name: names.get(r.client_id) ?? "AI assistant", scopes: r.scopes, connected_at: r.created_at, last_used_at: r.last_used_at });
  }
  return NextResponse.json({ apps: [...apps.values()] });
}

export async function DELETE(req: Request) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const id = new URL(req.url).searchParams.get("client_id");
  if (!id) return NextResponse.json({ error: "client_id required" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (createAdminClient() as any).from("oauth_tokens").update({ revoked: true }).eq("wallet", s.wallet).eq("client_id", id);
  return NextResponse.json({ ok: true });
}

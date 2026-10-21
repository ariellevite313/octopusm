import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { getProfiles } from "@/lib/profiles";

/** GET /api/notifications → { unread, items[] } (latest 50, newest first) */
export async function GET() {
  const me = await getWalletAddress();
  if (!me) return NextResponse.json({ unread: 0, items: [] });
  const wallet = me.startsWith("0x") ? me.toLowerCase() : me;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const [{ data: rows }, { count }] = await Promise.all([
    admin.from("notifications").select("id, type, actor, title, link, created_at, read_at")
      .eq("wallet", wallet).order("created_at", { ascending: false }).limit(50),
    admin.from("notifications").select("*", { count: "exact", head: true })
      .eq("wallet", wallet).is("read_at", null),
  ]);
  const list = (rows ?? []) as { id: string; type: string; actor: string; title: string; link: string; created_at: string; read_at: string | null }[];
  const profiles = await getProfiles(admin, list.map(r => r.actor));
  const items = list.map(r => {
    const p = profiles.get(r.actor);
    return { ...r, actor_name: p?.name ?? null, actor_avatar: p?.avatar_src ?? null };
  });
  return NextResponse.json({ unread: count ?? 0, items });
}

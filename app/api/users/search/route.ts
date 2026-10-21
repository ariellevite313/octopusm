/** GET /api/users/search?q= — suggestions pour les mentions @ (nom d'utilisateur, nom affiché, photo). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 30);
  if (q.length < 1) return NextResponse.json({ users: [] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (createAdminClient() as any)
    .from("wallets").select("address, username, display_name, avatar_src")
    .not("username", "is", null).ilike("username", `${q}%`).limit(6);
  return NextResponse.json({ users: (data ?? []).map((u: { address: string; username: string; display_name: string | null; avatar_src: string | null }) => ({ wallet: u.address, username: u.username, name: u.display_name, avatar: u.avatar_src })) });
}

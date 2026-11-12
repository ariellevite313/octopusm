/** GET /api/communities/[slug]/members?mods=1&offset=0  Membres (ou modérateurs) avec nom, photo et rôle. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCommunity, listMembers } from "@/lib/social/communities";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const u = new URL(req.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const c = await getCommunity(db, slug);
  if (!c) return NextResponse.json({ error: "Community not found" }, { status: 404 });
  const offset = Math.max(0, parseInt(u.searchParams.get("offset") ?? "0") || 0);
  const members = await listMembers(db, c.id, { mods: u.searchParams.get("mods") === "1", offset, limit: 50 });
  return NextResponse.json({ members, next: members.length === 50 ? offset + 50 : null });
}

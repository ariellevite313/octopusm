/**
 * GET   /api/communities/[slug]  Infos de la communauté, rôle du visiteur, photos des premiers membres.
 * PATCH /api/communities/[slug]  (admin, multipart : name, description, category, hashtags, logo, banner)
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { requireWallet } from "@/lib/social/session";
import { normWallet } from "@/lib/social/posts";
import { moderateImage, moderateText, sniffImage } from "@/lib/moderation";
import { cleanTags, COMMUNITY_CATEGORIES, getCommunity, memberFaces, memberOf } from "@/lib/social/communities";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const c = await getCommunity(db, slug);
  if (!c) return NextResponse.json({ error: "Community not found" }, { status: 404 });
  const raw = await getWalletAddress();
  const viewer = raw ? normWallet(raw) : null;
  const [me, faces, pinnedRes] = await Promise.all([
    memberOf(db, c.id, viewer),
    memberFaces(db, c.id),
    viewer ? db.from("wallets").select("pinned_community_id").eq("address", viewer).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return NextResponse.json({
    community: c, faces,
    viewer: me ? { role: me.role, status: me.status, pinned: pinnedRes.data?.pinned_community_id === c.id } : null,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upload(db: any, file: unknown, path: string): Promise<string | null | { error: string }> {
  if (!file || typeof file !== "object" || !("arrayBuffer" in file) || (file as File).size === 0) return null;
  const f = file as File;
  if (f.size > 4 * 1024 * 1024) return { error: "Image too large (max 4 MB)" };
  const bytes = await f.arrayBuffer();
  const real = sniffImage(new Uint8Array(bytes));
  if (!real) return { error: "This file is not a valid image (JPG, PNG, WEBP, GIF)" };
  if ((await moderateImage(bytes, real)) === "blocked") return { error: "This image goes against our rules" };
  const full = `${path}.${real.split("/")[1].replace("jpeg", "jpg")}`;
  const { error } = await db.storage.from("avatars").upload(full, bytes, { contentType: real, upsert: true });
  if (error) return { error: "Upload failed" };
  return `${db.storage.from("avatars").getPublicUrl(full).data.publicUrl}?t=${Date.now()}`;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const { slug } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const c = await getCommunity(db, slug);
  if (!c) return NextResponse.json({ error: "Community not found" }, { status: 404 });
  const me = await memberOf(db, c.id, s.wallet);
  if (me?.role !== "admin" || me.status !== "active") return NextResponse.json({ error: "Only the admin can edit the community" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (form.has("name")) {
    const name = String(form.get("name")).replace(/\s+/g, " ").trim();
    if (name.length < 3 || name.length > 50) return NextResponse.json({ error: "The name must be 3 to 50 characters" }, { status: 400 });
    patch.name = name;
  }
  if (form.has("description")) patch.description = String(form.get("description")).trim().slice(0, 500);
  if (form.has("category")) { const cat = String(form.get("category")); patch.category = (COMMUNITY_CATEGORIES as readonly string[]).includes(cat) ? cat : "other"; }
  if (form.has("hashtags")) patch.hashtags = cleanTags(form.get("hashtags"));
  const text = [patch.name, patch.description, ...((patch.hashtags as string[]) ?? [])].filter(Boolean).join("\n");
  if (text && (await moderateText(text)) === "blocked") return NextResponse.json({ error: "This content goes against our rules" }, { status: 400 });
  for (const k of ["logo", "banner"] as const) {
    const r = await upload(db, form.get(k), `communities/${c.slug}/${k}`);
    if (r && typeof r === "object") return NextResponse.json({ error: r.error }, { status: 400 });
    if (typeof r === "string") patch[`${k}_src`] = r;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  const { error } = await db.from("communities").update(patch).eq("id", c.id);
  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * GET  /api/communities?sort=popular|new&q=…&mine=1   Liste des communautés (mine=1 : celles dont je suis membre)
 * POST /api/communities  (multipart : name, slug, description, category, hashtags, logo, banner)
 *      Crée une communauté pour 100 OMERO. Le solde est vérifié et débité en base (create_community).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { requireWallet } from "@/lib/social/session";
import { normWallet } from "@/lib/social/posts";
import { moderateImage, moderateText, sniffImage } from "@/lib/moderation";
import {
  cleanSlug, cleanTags, COMMUNITY_CATEGORIES, COMMUNITY_COLUMNS, COMMUNITY_COST_OMERO, COMMUNITY_ERRORS, COMMUNITY_MAX_PER_WALLET,
  isReservedName, SLUG_RE, type Community,
} from "@/lib/social/communities";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const raw = await getWalletAddress();
  const viewer = raw ? normWallet(raw) : null;
  if (u.searchParams.get("mine") === "1") {
    if (!viewer) return NextResponse.json({ communities: [] });
    const { data: m } = await db.from("community_members").select("community_id, role").eq("wallet", viewer).eq("status", "active");
    const rows = (m ?? []) as { community_id: string; role: string }[];
    if (!rows.length) return NextResponse.json({ communities: [] });
    const { data } = await db.from("communities").select(COMMUNITY_COLUMNS).in("id", rows.map((r) => r.community_id)).eq("hidden", false);
    const roles = new Map(rows.map((r) => [r.community_id, r.role]));
    return NextResponse.json({ communities: ((data ?? []) as Community[]).map((c) => ({ ...c, role: roles.get(c.id) })) });
  }
  const q = (u.searchParams.get("q") ?? "").replace(/[^\w $-]/g, "").trim().slice(0, 40);
  let qy = db.from("communities").select(COMMUNITY_COLUMNS).eq("hidden", false).limit(60);
  if (q) qy = qy.or(`name.ilike.%${q}%,slug.ilike.%${q.toLowerCase().replace(/\s/g, "")}%`);
  qy = u.searchParams.get("sort") === "new" ? qy.order("created_at", { ascending: false }) : qy.order("member_count", { ascending: false }).order("created_at", { ascending: false });
  const { data, error } = await qy;
  if (error) return NextResponse.json({ communities: [] });
  let mine = new Set<string>();
  if (viewer && data?.length) {
    const { data: m } = await db.from("community_members").select("community_id").eq("wallet", viewer).eq("status", "active").in("community_id", (data as Community[]).map((c) => c.id));
    mine = new Set(((m ?? []) as { community_id: string }[]).map((r) => r.community_id));
  }
  return NextResponse.json({ communities: ((data ?? []) as Community[]).map((c) => ({ ...c, joined: mine.has(c.id) })), cost: COMMUNITY_COST_OMERO });
}

const IMG_MAX = 4 * 1024 * 1024;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function uploadImage(db: any, file: File | null, path: string): Promise<{ url: string | null } | { error: string }> {
  if (!file || typeof file !== "object" || !("arrayBuffer" in file) || file.size === 0) return { url: null };
  if (file.size > IMG_MAX) return { error: "Image too large (max 4 MB)" };
  const bytes = await file.arrayBuffer();
  const real = sniffImage(new Uint8Array(bytes));
  if (!real) return { error: "This file is not a valid image (JPG, PNG, WEBP, GIF)" };
  if ((await moderateImage(bytes, real)) === "blocked") return { error: "This image goes against our rules" };
  const full = `${path}.${real.split("/")[1].replace("jpeg", "jpg")}`;
  const { error } = await db.storage.from("avatars").upload(full, bytes, { contentType: real, upsert: true });
  if (error) return { error: "Upload failed" };
  return { url: `${db.storage.from("avatars").getPublicUrl(full).data.publicUrl}?t=${Date.now()}` };
}

export async function POST(req: Request) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form" }, { status: 400 });
  const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim();
  const slug = cleanSlug(form.get("slug") || name.replace(/\s+/g, "_"));
  const description = String(form.get("description") ?? "").trim().slice(0, 500);
  const cat = String(form.get("category") ?? "crypto");
  const category = (COMMUNITY_CATEGORIES as readonly string[]).includes(cat) ? cat : "other";
  const hashtags = cleanTags(form.get("hashtags"));

  if (name.length < 3 || name.length > 50) return NextResponse.json({ error: "The name must be 3 to 50 characters" }, { status: 400 });
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: COMMUNITY_ERRORS.invalid_slug.message }, { status: 400 });
  if (isReservedName(name, slug)) return NextResponse.json({ error: COMMUNITY_ERRORS.reserved_name.message }, { status: 400 });
  if ((await moderateText(`${name}\n${description}\n${hashtags.join(" ")}`)) === "blocked") return NextResponse.json({ error: "This content goes against our rules" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: taken } = await db.from("communities").select("id").eq("slug", slug).maybeSingle();
  if (taken) return NextResponse.json({ error: COMMUNITY_ERRORS.slug_taken.message }, { status: 409 });

  const logo = await uploadImage(db, form.get("logo") as File | null, `communities/${slug}/logo`);
  if ("error" in logo) return NextResponse.json({ error: logo.error }, { status: 400 });
  const banner = await uploadImage(db, form.get("banner") as File | null, `communities/${slug}/banner`);
  if ("error" in banner) return NextResponse.json({ error: banner.error }, { status: 400 });

  const { data, error } = await db.rpc("create_community", {
    p_creator: s.wallet, p_slug: slug, p_name: name, p_description: description, p_category: category, p_hashtags: hashtags,
    p_logo: logo.url, p_banner: banner.url, p_cost: COMMUNITY_COST_OMERO, p_max_per_wallet: COMMUNITY_MAX_PER_WALLET,
  });
  if (error) { console.error("[communities]", error.message); return NextResponse.json({ error: "Could not create the community" }, { status: 500 }); }
  const r = (data ?? {}) as { ok?: boolean; error?: string; slug?: string; balance?: number };
  if (!r.ok) {
    const e = COMMUNITY_ERRORS[r.error ?? ""] ?? { status: 400, message: "Could not create the community" };
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return NextResponse.json({ slug: r.slug, balance: r.balance }, { status: 201 });
}

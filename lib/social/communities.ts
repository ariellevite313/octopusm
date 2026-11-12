/**
 * Communautés publiques : création (100 OMERO), membres et rôles (admin, mod, membre), posts rattachés.
 * Toutes les écritures passent par le serveur (service role) ; la création passe par la fonction SQL create_community
 * (solde vérifié et débité dans la même transaction).
 */
import { getProfiles } from "@/lib/profiles";

import { COMMUNITY_COLUMNS, COMMUNITY_COST_OMERO, COMMUNITY_MAX_PER_WALLET, RESERVED, SLUG_RE, type Community, type CommunityLite, type CommunityRole } from "@/lib/social/communities-shared";
export * from "@/lib/social/communities-shared";

export const COMMUNITY_ERRORS: Record<string, { status: number; message: string }> = {
  invalid_slug: { status: 400, message: "The address must be 3 to 30 characters: letters, numbers or _" },
  slug_taken: { status: 409, message: "This address is already taken" },
  limit_reached: { status: 403, message: `You can create up to ${COMMUNITY_MAX_PER_WALLET} communities` },
  insufficient_balance: { status: 400, message: `You need ${COMMUNITY_COST_OMERO} OMERO to create a community` },
  reserved_name: { status: 400, message: "This name is reserved" },
};

export function cleanSlug(s: unknown): string {
  return String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
}
export function cleanTags(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : String(v ?? "").split(/[\s,]+/);
  return [...new Set(arr.map((t) => String(t).replace(/^#/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 30)).filter((t) => t.length >= 2))].slice(0, 6);
}
export function isReservedName(name: string, slug: string): boolean {
  return RESERVED.test(name) || RESERVED.test(slug);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function getCommunity(db: Db, slug: string): Promise<Community | null> {
  if (!SLUG_RE.test(slug)) return null;
  const { data } = await db.from("communities").select(COMMUNITY_COLUMNS).eq("slug", slug).eq("hidden", false).maybeSingle();
  return (data as Community) ?? null;
}

export async function memberOf(db: Db, communityId: string, wallet: string | null): Promise<{ role: CommunityRole; status: string } | null> {
  if (!wallet) return null;
  const { data } = await db.from("community_members").select("role, status").eq("community_id", communityId).eq("wallet", wallet).maybeSingle();
  return (data as { role: CommunityRole; status: string }) ?? null;
}

/** Membres (ou modérateurs) avec nom et photo, admin puis modérateurs puis membres. */
export async function listMembers(db: Db, communityId: string, opts: { mods?: boolean; limit?: number; offset?: number } = {}) {
  let q = db.from("community_members").select("wallet, role, created_at").eq("community_id", communityId).eq("status", "active");
  if (opts.mods) q = q.in("role", ["admin", "mod"]);
  const { data } = await q.order("created_at", { ascending: true }).range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 50) - 1);
  const rows = ((data ?? []) as { wallet: string; role: CommunityRole; created_at: string }[])
    .sort((a, b) => ["admin", "mod", "member"].indexOf(a.role) - ["admin", "mod", "member"].indexOf(b.role));
  const prof = await getProfiles(db, rows.map((r) => r.wallet));
  const { data: ws } = rows.length ? await db.from("wallets").select("address, username").in("address", rows.map((r) => r.wallet)) : { data: [] };
  const handles = new Map(((ws ?? []) as { address: string; username: string | null }[]).map((w) => [w.address, w.username]));
  return rows.map((r) => ({ wallet: r.wallet, role: r.role, name: prof.get(r.wallet)?.name ?? null, avatar: prof.get(r.wallet)?.avatar_src ?? null, username: handles.get(r.wallet) ?? null }));
}

/** Petites infos de communautés (pour les posts et les profils). */
export async function communitiesLite(db: Db, ids: string[]): Promise<Map<string, CommunityLite>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const { data } = await db.from("communities").select("id, slug, name, logo_src, member_count").in("id", uniq).eq("hidden", false);
  return new Map(((data ?? []) as CommunityLite[]).map((c) => [c.id, c]));
}

/** Avatars des premiers membres (pour la pile de photos). */
export async function memberFaces(db: Db, communityId: string, n = 5): Promise<string[]> {
  const { data } = await db.from("community_members").select("wallet").eq("community_id", communityId).eq("status", "active").order("created_at", { ascending: true }).limit(20);
  const prof = await getProfiles(db, ((data ?? []) as { wallet: string }[]).map((r) => r.wallet));
  return [...prof.values()].map((p) => p.avatar_src).filter((x): x is string => !!x).slice(0, n);
}

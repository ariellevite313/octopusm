/** Constantes et types des communautés (utilisables côté navigateur). */
export const COMMUNITY_COST_OMERO = 100;
export const COMMUNITY_MAX_PER_WALLET = 3;
export const COMMUNITY_CATEGORIES = ["crypto", "memecoins", "trading", "predictions", "builders", "gaming", "art", "sports", "other"] as const;
export const SLUG_RE = /^[a-z0-9_]{3,30}$/;
/** Noms réservés : on ne laisse personne se faire passer pour l'équipe */
export const RESERVED = /(omdot|omdotfun|official|officiel|admin|support|team|staff|moderat)/i;

export type CommunityRole = "admin" | "mod" | "member";
export type Community = {
  id: string; slug: string; name: string; description: string; category: string; hashtags: string[];
  logo_src: string | null; banner_src: string | null; creator: string; member_count: number; post_count: number;
  pinned_post: string | null; created_at: string;
};
export type CommunityLite = Pick<Community, "id" | "slug" | "name" | "logo_src" | "member_count">;

export const COMMUNITY_COLUMNS = "id, slug, name, description, category, hashtags, logo_src, banner_src, creator, member_count, post_count, pinned_post, created_at";


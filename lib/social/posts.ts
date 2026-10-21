/**
 * Helpers serveur du fil social : types, lecture enrichie (auteur, likes, token, états du viewer).
 */
import { getProfiles } from "@/lib/profiles";
import { getFeaturedTokens, type FeaturedToken } from "@/lib/social/featured-token";

export const MAX_BODY = 2000;
export const MAX_IMAGES = 2;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const TICKER_RE = /\$([A-Za-z][A-Za-z0-9]{1,15})/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FeedPost = {
  id: string;
  author: string;
  author_name: string | null;
  author_avatar: string | null;
  author_octo: number;
  author_token: FeaturedToken | null;
  body: string;
  images: string[];
  ticker: string | null;
  token: { id: string; name: string; ticker: string; logo_url: string | null } | null;
  like_count: number;
  reply_count: number;
  view_count: number;
  created_at: string;
  liked_by_me: boolean;
  liker_avatars: string[];
  mine: boolean;
  following_author: boolean;
};

type Row = {
  id: string; author: string; body: string; images: string[] | null; ticker: string | null; token_id: string | null;
  like_count: number; reply_count: number; view_count: number; created_at: string;
};

/** Ajoute auteur, token, likes du viewer et derniers likers (photos) à des lignes `posts`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enrichPosts(admin: any, rows: Row[], viewer: string | null): Promise<FeedPost[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const tokenIds = [...new Set(rows.map((r) => r.token_id).filter(Boolean))] as string[];

  const [profiles, tokensRes, mineLikes, recentLikes, followsRes, featured] = await Promise.all([
    getProfiles(admin, rows.map((r) => r.author)),
    tokenIds.length
      ? admin.from("launchpad_tokens").select("id, name, ticker, logo_url").in("id", tokenIds)
      : Promise.resolve({ data: [] }),
    viewer
      ? admin.from("post_likes").select("post_id").eq("wallet", viewer).in("post_id", ids)
      : Promise.resolve({ data: [] }),
    admin.from("post_likes").select("post_id, wallet").in("post_id", ids).order("created_at", { ascending: false }).limit(ids.length * 6),
    viewer
      ? admin.from("follows").select("following").eq("follower", viewer).in("following", [...new Set(rows.map((r) => r.author))])
      : Promise.resolve({ data: [] }),
    getFeaturedTokens(admin, rows.map((r) => r.author)),
  ]);
  const followed = new Set(((followsRes.data ?? []) as { following: string }[]).map((f) => f.following));

  const tokens = new Map<string, FeedPost["token"]>(
    ((tokensRes.data ?? []) as NonNullable<FeedPost["token"]>[]).map((t) => [t.id, t]),
  );
  const liked = new Set(((mineLikes.data ?? []) as { post_id: string }[]).map((l) => l.post_id));

  const byPost = new Map<string, string[]>();
  for (const l of (recentLikes.data ?? []) as { post_id: string; wallet: string }[]) {
    const arr = byPost.get(l.post_id) ?? [];
    if (arr.length < 3) arr.push(l.wallet);
    byPost.set(l.post_id, arr);
  }
  const likerProfiles = await getProfiles(admin, [...byPost.values()].flat());

  return rows.map((r) => {
    const p = profiles.get(r.author);
    return {
      id: r.id,
      author: r.author,
      author_name: p?.name ?? null,
      author_avatar: p?.avatar_src ?? null,
      author_octo: p?.octo ?? 0,
      author_token: featured.get(r.author) ?? null,
      body: r.body,
      images: r.images ?? [],
      ticker: r.ticker,
      token: r.token_id ? tokens.get(r.token_id) ?? null : null,
      like_count: r.like_count,
      reply_count: r.reply_count,
      view_count: r.view_count,
      created_at: r.created_at,
      liked_by_me: liked.has(r.id),
      liker_avatars: (byPost.get(r.id) ?? []).map((w) => likerProfiles.get(w)?.avatar_src ?? "").filter(Boolean),
      mine: !!viewer && r.author === viewer,
      following_author: followed.has(r.author),
    };
  });
}

export const POST_COLUMNS =
  "id, author, body, images, ticker, token_id, like_count, reply_count, view_count, created_at";

/** Normalise une adresse : EVM en minuscules, Solana inchangée. */
export function normWallet(w: string): string {
  return /^0x[0-9a-fA-F]{40}$/.test(w) ? w.toLowerCase() : w;
}

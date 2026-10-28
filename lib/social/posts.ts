/**
 * Helpers serveur du fil social : types, lecture enrichie (auteur, likes, token, états du viewer).
 */
import { getProfiles } from "@/lib/profiles";
import type { FeaturedToken } from "@/lib/social/featured-token";

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
  /** @username (minuscules) → wallet */
  mentions: Record<string, string>;
  market: SharedMarket | null;
  repost_count: number;
  reposted_by_me: boolean;
  /** Clé unique dans le fil (un même post peut apparaître une fois en direct et une fois en repost) */
  feed_key: string;
  /** Présent quand cette entrée du fil est un repost : qui a republié */
  reposted_by: { wallet: string; name: string | null } | null;
  /** Post cité (citation) */
  quoted: QuotedPost | null;
};

export type QuotedPost = {
  id: string; author: string; author_name: string | null; author_avatar: string | null;
  body: string; images: string[]; created_at: string;
};

export type SharedMarket = {
  kind: "pool" | "prediction";
  title: string;
  image: string | null;
  href: string;
  options: string[];
  pool: string | null;
  closes_at: string | null;
  status: string;
  /** Marché sur le prix d'une crypto : ticker et objectif */
  price_ticker?: string | null;
  price_target?: number | null;
  /** Identifiants des options (boutons Oui / Non) */
  option_ids?: string[];
  /** Pool lié à un match : clé du match pour afficher le score en direct */
  match_key?: string | null;
};

type Row = {
  id: string; author: string; body: string; images: string[] | null; ticker: string | null; token_id: string | null;
  mentions?: Record<string, string> | null; market_kind?: "pool" | "prediction" | null; market_id?: string | null;
  like_count: number; reply_count: number; view_count: number; created_at: string;
  repost_of?: string | null; quote_of?: string | null; repost_count?: number | null;
};

/** Ajoute auteur, token, likes du viewer et derniers likers (photos) à des lignes `posts`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enrichPosts(admin: any, rowsIn: Row[], viewer: string | null): Promise<FeedPost[]> {
  if (rowsIn.length === 0) return [];
  // Reposts : on affiche le post d'origine, avec « X a republié » au-dessus
  const origIds = [...new Set(rowsIn.map((r) => r.repost_of).filter(Boolean))] as string[];
  const quoteIds = [...new Set(rowsIn.map((r) => r.quote_of).filter(Boolean))] as string[];
  const [origRes, quotedRes] = await Promise.all([
    origIds.length ? admin.from("posts").select(POST_COLUMNS).in("id", origIds).eq("hidden", false) : Promise.resolve({ data: [] }),
    quoteIds.length ? admin.from("posts").select("id, author, body, images, created_at").in("id", quoteIds).eq("hidden", false) : Promise.resolve({ data: [] }),
  ]);
  const originals = new Map<string, Row>(((origRes.data ?? []) as Row[]).map((r) => [r.id, r]));
  const quotedRows = (quotedRes.data ?? []) as { id: string; author: string; body: string; images: string[] | null; created_at: string }[];
  const entries = rowsIn
    .map((r) => (r.repost_of ? { row: originals.get(r.repost_of), by: r } : { row: r, by: null }))
    .filter((e): e is { row: Row; by: Row | null } => !!e.row);
  const rows = entries.map((e) => e.row);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const tokenIds = [...new Set(rows.map((r) => r.token_id).filter(Boolean))] as string[];

  const [profiles, tokensRes, mineLikes, recentLikes, followsRes, myReposts] = await Promise.all([
    getProfiles(admin, [...rows.map((r) => r.author), ...entries.filter((e) => e.by).map((e) => e.by!.author), ...quotedRows.map((q) => q.author)]),
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
    viewer
      ? admin.from("posts").select("repost_of").eq("author", viewer).in("repost_of", ids)
      : Promise.resolve({ data: [] }),
  ]);
  const repostedSet = new Set(((myReposts.data ?? []) as { repost_of: string }[]).map((x) => x.repost_of));
  const quoted = new Map<string, QuotedPost>(quotedRows.map((q) => {
    const qp = profiles.get(q.author);
    return [q.id, { id: q.id, author: q.author, author_name: qp?.name ?? null, author_avatar: qp?.avatar_src ?? null, body: q.body, images: q.images ?? [], created_at: q.created_at }];
  }));
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
  const [likerProfiles, markets] = await Promise.all([getProfiles(admin, [...byPost.values()].flat()), loadMarkets(admin, rows)]);

  return entries.map(({ row: r, by }) => {
    const p = profiles.get(r.author);
    return {
      feed_key: by ? `repost:${by.id}` : r.id,
      reposted_by: by ? { wallet: by.author, name: profiles.get(by.author)?.name ?? null } : null,
      quoted: r.quote_of ? quoted.get(r.quote_of) ?? null : null,
      repost_count: r.repost_count ?? 0,
      reposted_by_me: repostedSet.has(r.id),
      id: r.id,
      author: r.author,
      author_name: p?.name ?? null,
      author_avatar: p?.avatar_src ?? null,
      author_octo: p?.octo ?? 0,
      author_token: p?.token ?? null,
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
      mentions: r.mentions ?? {},
      market: r.market_id ? markets.get(r.market_id) ?? null : null,
    };
  });
}

export const POST_COLUMNS =
  "id, author, body, images, ticker, token_id, like_count, reply_count, view_count, created_at, mentions, market_kind, market_id, repost_of, quote_of, repost_count";

const fmtPool = (n: number, unit: string) => `${n >= 1000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n)} ${unit}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadMarkets(admin: any, rows: Row[]): Promise<Map<string, SharedMarket>> {
  const out = new Map<string, SharedMarket>();
  const pools = rows.filter((r) => r.market_kind === "pool" && r.market_id).map((r) => r.market_id!) ;
  const preds = rows.filter((r) => r.market_kind === "prediction" && r.market_id).map((r) => r.market_id!);
  const parse = (o: unknown) => (typeof o === "string" ? JSON.parse(o) : o) as { id: string; label?: string; name?: string }[] | null;
  try {
    const [p, q] = await Promise.all([
      pools.length ? admin.from("mutuel_markets").select("id, slug, title, cover_image_src, options, status, bet_token, total_pool_usdc, total_pool_clt, betting_closes_at, match_key").in("id", pools) : { data: [] },
      preds.length ? admin.from("prediction_markets").select("id, slug, title, single_image_src, left_competitor_image_src, options, is_resolved, is_active, event_start_at, price_ticker, price_target").in("id", preds) : { data: [] },
    ]);
    for (const m of (p.data ?? []) as Record<string, unknown>[]) {
      const opts = parse(m.options) ?? [];
      const clt = m.bet_token === "clawdtrust";
      out.set(String(m.id), {
        kind: "pool", title: String(m.title), image: (m.cover_image_src as string) ?? null, href: `/pools/${m.slug ?? m.id}`,
        options: opts.slice(0, 8).map((o) => o.label ?? o.name ?? o.id),
        pool: fmtPool(Number(clt ? m.total_pool_clt : m.total_pool_usdc) || 0, clt ? "CLT" : "USDC"),
        closes_at: (m.betting_closes_at as string) ?? null, status: String(m.status),
        option_ids: opts.slice(0, 8).map((o) => o.id),
        match_key: (m.match_key as string) ?? null,
      });
    }
    for (const m of (q.data ?? []) as Record<string, unknown>[]) {
      const opts = parse(m.options) ?? [];
      out.set(String(m.id), {
        kind: "prediction", title: String(m.title), image: ((m.single_image_src ?? m.left_competitor_image_src) as string) ?? null, href: `/prediction/${m.slug ?? m.id}`,
        options: opts.slice(0, 8).map((o) => o.label ?? o.name ?? o.id), pool: null,
        closes_at: (m.event_start_at as string) ?? null, status: m.is_resolved ? "resolved" : m.is_active ? "active" : "closed",
        price_ticker: (m.price_ticker as string) ?? null, price_target: m.price_target != null ? Number(m.price_target) : null,
        option_ids: opts.slice(0, 8).map((o) => o.id),
      });
    }
  } catch { /* marché introuvable : pas de carte */ }
  return out;
}

/** Aperçu d'un marché à partir d'un lien collé (slug ou uuid) : même carte que dans le post publié. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function previewMarket(admin: any, ref: { kind: "pool" | "prediction"; key: string }): Promise<SharedMarket | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref.key);
  const { data: m } = await admin.from(ref.kind === "pool" ? "mutuel_markets" : "prediction_markets").select("id").eq(isUuid ? "id" : "slug", ref.key).maybeSingle();
  if (!m) return null;
  const map = await loadMarkets(admin, [{ market_kind: ref.kind, market_id: m.id } as Row]);
  return map.get(String(m.id)) ?? null;
}

/** Normalise une adresse : EVM en minuscules, Solana inchangée. */
export function normWallet(w: string): string {
  return /^0x[0-9a-fA-F]{40}$/.test(w) ? w.toLowerCase() : w;
}

/**
 * Profils publics lus en direct (nom, photo, niveau OMERO).
 * Source unique : évite d'afficher une copie figée au moment du post.
 */

import { getFeaturedTokens, type FeaturedToken } from "@/lib/social/featured-token";

export type PublicProfile = {
  /** Nom affiché : display_name, sinon username, sinon null */
  name: string | null;
  avatar_src: string | null;
  octo: number;
  /** Token recommandé (logo à côté du nom) */
  token?: FeaturedToken | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getProfiles(admin: any, addresses: string[]): Promise<Map<string, PublicProfile>> {
  const map = new Map<string, PublicProfile>();
  const addrs = [...new Set(addresses.filter(Boolean))];
  if (addrs.length === 0) return map;

  const [walletsRes, octoRes, featured] = await Promise.all([
    admin.from("wallets").select("address, username, display_name, avatar_src").in("address", addrs),
    admin.from("leaderboard_octo").select("wallet_address, total_octo").in("wallet_address", addrs),
    getFeaturedTokens(admin, addrs),
  ]);

  for (const w of (walletsRes.data ?? []) as { address: string; username: string | null; display_name: string | null; avatar_src: string | null }[]) {
    map.set(w.address, {
      name: w.display_name?.trim() || w.username?.trim() || null,
      avatar_src: w.avatar_src ?? null,
      octo: 0,
    });
  }
  for (const o of (octoRes.data ?? []) as { wallet_address: string; total_octo: number }[]) {
    const p = map.get(o.wallet_address) ?? { name: null, avatar_src: null, octo: 0 };
    p.octo = Number(o.total_octo ?? 0);
    map.set(o.wallet_address, p);
  }
  for (const [addr, t] of featured) {
    const p = map.get(addr) ?? { name: null, avatar_src: null, octo: 0 };
    p.token = t;
    map.set(addr, p);
  }
  return map;
}

type CommentLike = {
  wallet_address: string;
  username: string | null;
  avatar_src: string | null;
  octo_balance: number;
  featured_token?: FeaturedToken | null;
  replies?: CommentLike[];
};

/** Remplace nom / photo / niveau de chaque commentaire (et réponses) par le profil actuel. */
export function applyProfiles<T extends CommentLike>(list: T[], profiles: Map<string, PublicProfile>): T[] {
  const patch = (c: CommentLike) => {
    const p = profiles.get(c.wallet_address);
    if (p) {
      c.username = p.name ?? c.username;
      c.avatar_src = p.avatar_src ?? c.avatar_src;
      if (p.octo > 0) c.octo_balance = p.octo;
      c.featured_token = p.token ?? null;
    }
    c.replies?.forEach(patch);
  };
  list.forEach(patch);
  return list;
}

/** Tous les wallets d'une liste de commentaires (réponses incluses). */
export function commentWallets(list: { wallet_address: string; replies?: { wallet_address: string }[] }[]): string[] {
  return list.flatMap(c => [c.wallet_address, ...(c.replies ?? []).map(r => r.wallet_address)]);
}

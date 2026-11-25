/** Discover côté serveur : lecture des fiches avec leur token OM. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type AppCard = {
  id: string; name: string; tagline: string; category: string; icon: string | null; banner: string | null;
  rating: number; ratings: number; visits: number; siteUrl: string; createdAt: string;
  token: { id: string; ticker: string; name: string; logo: string | null; chain: string; slug: string };
};

export const APP_COLS = "id, token_id, owner, name, tagline, description, category, site_url, icon_url, banner_url, screenshots, payment_note, status, rating_avg, rating_count, created_at";
type Row = { id: string; token_id: string; owner: string; name: string; tagline: string; description: string; category: string; site_url: string; icon_url: string | null; banner_url: string | null; screenshots: string[]; payment_note: string; status: string; rating_avg: number; rating_count: number; visits?: number; created_at: string };
type Tok = { id: string; ticker: string; name: string; logo_url: string | null; chain: string | null; mint_address: string | null; arc_launch_id: string | null };

export async function withTokens(db: Db, rows: Row[]) {
  const ids = [...new Set(rows.map((r) => r.token_id))];
  const { data } = ids.length ? await db.from("launchpad_tokens").select("id, ticker, name, logo_url, chain, mint_address, arc_launch_id").in("id", ids) : { data: [] };
  const toks = new Map<string, Tok>(((data ?? []) as Tok[]).map((t) => [t.id, t]));
  // Visites lues à part : la colonne n'existe qu'après la migration 20261214 (sans elle, 0 partout)
  const visits = new Map<string, number>();
  if (rows.length) {
    const { data: v, error } = await db.from("discover_apps").select("id, visits").in("id", rows.map((r) => r.id));
    if (!error) for (const x of (v ?? []) as { id: string; visits: number }[]) visits.set(x.id, Number(x.visits) || 0);
  }
  return rows.map((r) => {
    const t = toks.get(r.token_id);
    const chain = t?.chain ?? "solana";
    return {
      row: r,
      card: {
        id: r.id, name: r.name, tagline: r.tagline, category: r.category, icon: r.icon_url ?? t?.logo_url ?? null, banner: r.banner_url ?? r.screenshots?.[0] ?? null,
        rating: Number(r.rating_avg) || 0, ratings: Number(r.rating_count) || 0, visits: visits.get(r.id) ?? 0, siteUrl: r.site_url, createdAt: r.created_at,
        token: { id: r.token_id, ticker: t?.ticker ?? "", name: t?.name ?? "", logo: t?.logo_url ?? null, chain, slug: (chain === "arc" ? t?.mint_address ?? t?.arc_launch_id : t?.mint_address) ?? r.token_id },
      } satisfies AppCard,
    };
  });
}

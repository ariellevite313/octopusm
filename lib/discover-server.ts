/** Discover côté serveur : lecture des fiches avec leur token OM. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type AppCard = {
  id: string; name: string; tagline: string; category: string; icon: string | null; banner: string | null;
  rating: number; ratings: number; visits: number; siteUrl: string; createdAt: string; platform: boolean; boostedUntil: string | null; noToken: boolean; network: string | null; verified: boolean;
  token: { id: string; ticker: string; name: string; logo: string | null; chain: string; slug: string; price: number | null; mcap: number | null; volume24h: number | null; pool: string | null; mint: string | null; curve: string | null };
};

export const APP_COLS = "id, token_id, owner, name, tagline, description, category, site_url, icon_url, banner_url, screenshots, payment_note, status, rating_avg, rating_count, created_at";
/** Filtre des fiches visibles : avec token, ou sans token de l'admin (pas de date), ou sans token encore payées. */
export const LIVE_LISTING = () => `token_id.not.is.null,listing_paid_until.is.null,listing_paid_until.gt.${new Date().toISOString()}`;
type Row = { id: string; token_id: string | null; owner: string; name: string; tagline: string; description: string; category: string; site_url: string; icon_url: string | null; banner_url: string | null; screenshots: string[]; payment_note: string; status: string; rating_avg: number; rating_count: number; visits?: number; created_at: string; boosted_until?: string | null };
type Tok = { id: string; ticker: string; name: string; logo_url: string | null; chain: string | null; mint_address: string | null; arc_launch_id: string | null; price_usd?: number | null; market_cap_usd?: number | null; volume_24h_usd?: number | null; pool_address?: string | null };

export async function withTokens(db: Db, rows: Row[]) {
  const ids = [...new Set(rows.map((r) => r.token_id).filter((x): x is string => !!x))];
  const { data } = ids.length ? await db.from("launchpad_tokens").select("id, ticker, name, logo_url, chain, mint_address, arc_launch_id, price_usd, market_cap_usd, volume_24h_usd, pool_address").in("id", ids) : { data: [] };
  const toks = new Map<string, Tok>(((data ?? []) as Tok[]).map((t) => [t.id, t]));
  // Visites lues à part : la colonne n'existe qu'après la migration 20261214 (sans elle, 0 partout)
  const visits = new Map<string, number>();
  if (rows.length) {
    const { data: v, error } = await db.from("discover_apps").select("id, visits").in("id", rows.map((r) => r.id));
    if (!error) for (const x of (v ?? []) as { id: string; visits: number }[]) visits.set(x.id, Number(x.visits) || 0);
  }
  // Boost et propriétaires admin lus à part (colonne ajoutée par la migration 20261217)
  const boosts = new Map<string, string | null>();
  const admins = new Set<string>();
  const nets = new Map<string, string | null>();
  const verified = new Set<string>();
  if (rows.length) {
    const { data: b, error } = await db.from("discover_apps").select("id, boosted_until").in("id", rows.map((r) => r.id));
    if (!error) for (const x of (b ?? []) as { id: string; boosted_until: string | null }[]) boosts.set(x.id, x.boosted_until);
    // Réseau des fiches sans token (colonne de la migration 20261219)
    const { data: n, error: nErr } = await db.from("discover_apps").select("id, network").in("id", rows.map((r) => r.id));
    if (!nErr) for (const x of (n ?? []) as { id: string; network: string | null }[]) nets.set(x.id, x.network);
    // Puce bleue donnée par l'admin (colonne de la migration 20261220)
    const { data: vf, error: vErr } = await db.from("discover_apps").select("id").in("id", rows.map((r) => r.id)).eq("verified", true);
    if (!vErr) for (const x of (vf ?? []) as { id: string }[]) verified.add(x.id);
    const { data: w } = await db.from("wallets").select("address").in("address", [...new Set(rows.map((r) => r.owner))]).eq("role", "admin");
    for (const x of (w ?? []) as { address: string }[]) admins.add(x.address);
  }
  return rows.map((r) => {
    const platform = admins.has(r.owner);
    // L'app de la plateforme (OM) se paie en SOL : pas de token de projet affiché
    const own = r.token_id ? toks.get(r.token_id) : undefined;
    const noToken = !r.token_id;
    const t = platform ? undefined : own;
    const chain = own?.chain ?? "solana";
    // Réseau affiché : celui choisi pour une fiche sans token, sinon celui du token
    const network = noToken ? nets.get(r.id) ?? null : chain === "arc" ? "arc" : "solana";
    return {
      row: r,
      card: {
        id: r.id, name: r.name, tagline: r.tagline, category: r.category, icon: r.icon_url ?? own?.logo_url ?? null, banner: r.banner_url ?? r.screenshots?.[0] ?? null,
        rating: Number(r.rating_avg) || 0, ratings: Number(r.rating_count) || 0, visits: visits.get(r.id) ?? 0, siteUrl: r.site_url, createdAt: r.created_at,
        platform, boostedUntil: boosts.get(r.id) ?? null, noToken, network, verified: verified.has(r.id),
        token: { id: r.token_id ?? "", ticker: t?.ticker ?? "", name: t?.name ?? "", logo: t?.logo_url ?? null, chain, slug: (chain === "arc" ? t?.mint_address ?? t?.arc_launch_id : t?.mint_address) ?? r.token_id ?? "",
          price: t?.price_usd != null ? Number(t.price_usd) : null, mcap: t?.market_cap_usd != null ? Number(t.market_cap_usd) : null,
          volume24h: t?.volume_24h_usd != null ? Number(t.volume_24h_usd) : null, pool: t?.pool_address ?? null, mint: t?.mint_address ?? null, curve: t?.arc_launch_id ?? null },
      } satisfies AppCard,
    };
  });
}

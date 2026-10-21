/**
 * Token recommandé par un wallet (logo affiché à côté du nom, lien vers sa page OMdotfun).
 * Tolère l'absence de la colonne avant la migration.
 */
export type FeaturedToken = { id: string; ticker: string; logo: string | null; href: string };

const LIVE = ["active", "graduating", "graduated"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getFeaturedTokens(admin: any, addresses: string[]): Promise<Map<string, FeaturedToken>> {
  const out = new Map<string, FeaturedToken>();
  const addrs = [...new Set(addresses.filter(Boolean))];
  if (addrs.length === 0) return out;
  try {
    const { data: ws, error } = await admin.from("wallets").select("address, featured_token_id").in("address", addrs).not("featured_token_id", "is", null);
    if (error || !ws?.length) return out;
    const ids = [...new Set((ws as { featured_token_id: string }[]).map((w) => w.featured_token_id))];
    const { data: ts } = await admin.from("launchpad_tokens").select("id, ticker, logo_url, mint_address, status, is_hidden").in("id", ids);
    const byId = new Map<string, FeaturedToken>();
    for (const t of (ts ?? []) as { id: string; ticker: string; logo_url: string | null; mint_address: string | null; status: string; is_hidden: boolean | null }[]) {
      if (t.is_hidden || !LIVE.includes(t.status)) continue;
      byId.set(t.id, { id: t.id, ticker: t.ticker, logo: t.logo_url, href: `/launchpad/${t.mint_address ?? t.id}` });
    }
    for (const w of ws as { address: string; featured_token_id: string }[]) {
      const t = byId.get(w.featured_token_id);
      if (t) out.set(w.address, t);
    }
  } catch { /* colonne absente avant migration */ }
  return out;
}

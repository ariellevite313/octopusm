/**
 * GET /api/social/sidebar → colonne de droite du fil (ordinateur) :
 *   trending : hashtags et tokens les plus cités sur 7 jours
 *   who      : comptes à suivre (les plus suivis, hors soi-même et comptes déjà suivis)
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { normWallet } from "@/lib/social/posts";

export const dynamic = "force-dynamic";

type Trend = { kind: "tag" | "token"; label: string; count: number; href: string; logo: string | null; name: string | null };
type Who = { wallet: string; username: string | null; name: string | null; avatar: string | null; followers: number };

export async function GET() {
  const raw = await getWalletAddress();
  const viewer = raw ? normWallet(raw) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();

  // Tendances
  const trending: Trend[] = [];
  try {
    const { data: ps } = await admin.from("posts").select("author, tags, token_id").eq("hidden", false).gte("created_at", since).order("created_at", { ascending: false }).limit(1000);
    const tags = new Map<string, number>(), toks = new Map<string, number>();
    for (const p of (ps ?? []) as { tags: string[] | null; token_id: string | null }[]) {
      for (const t of p.tags ?? []) tags.set(t, (tags.get(t) ?? 0) + 1);
      if (p.token_id) toks.set(p.token_id, (toks.get(p.token_id) ?? 0) + 1);
    }
    const topToks = [...toks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topToks.length) {
      const { data: ts } = await admin.from("launchpad_tokens").select("id, name, ticker, logo_url, mint_address, is_hidden").in("id", topToks.map(([id]) => id));
      const byId = new Map(((ts ?? []) as { id: string; name: string; ticker: string; logo_url: string | null; mint_address: string | null; is_hidden: boolean | null }[]).map((t) => [t.id, t]));
      for (const [id, n] of topToks) {
        const t = byId.get(id);
        if (t && !t.is_hidden) trending.push({ kind: "token", label: `$${t.ticker}`, count: n, href: `/launchpad/${t.mint_address ?? t.id}`, logo: t.logo_url, name: t.name });
      }
    }
    for (const [t, n] of [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      trending.push({ kind: "tag", label: `#${t}`, count: n, href: `/feed?tag=${encodeURIComponent(t)}`, logo: null, name: null });
    }
    trending.sort((a, b) => b.count - a.count);
    trending.splice(5);
  } catch { /* colonne tags absente */ }

  // Comptes à suivre
  const who: Who[] = [];
  try {
    const [{ data: fs }, mine] = await Promise.all([
      admin.from("follows").select("following").limit(5000),
      viewer ? admin.from("follows").select("following").eq("follower", viewer) : Promise.resolve({ data: [] }),
    ]);
    const skip = new Set<string>([...(((mine.data ?? []) as { following: string }[]).map((x) => x.following)), ...(viewer ? [viewer] : [])]);
    const counts = new Map<string, number>();
    for (const f of (fs ?? []) as { following: string }[]) if (!skip.has(f.following)) counts.set(f.following, (counts.get(f.following) ?? 0) + 1);
    let ids = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w]) => w);
    // Complète avec les auteurs récents
    if (ids.length < 12) {
      const { data: rec } = await admin.from("posts").select("author").eq("hidden", false).order("created_at", { ascending: false }).limit(60);
      for (const r of (rec ?? []) as { author: string }[]) if (!skip.has(r.author) && !ids.includes(r.author)) ids.push(r.author);
      ids = ids.slice(0, 12);
    }
    if (ids.length) {
      const [{ data: ws }, bans] = await Promise.all([
        admin.from("wallets").select("address, username, display_name, avatar_src").in("address", ids),
        admin.from("banned_wallets").select("wallet").in("wallet", ids).then((r: { data: unknown }) => r, () => ({ data: [] })),
      ]);
      const banned = new Set(((bans.data ?? []) as { wallet: string }[]).map((b) => b.wallet));
      const byW = new Map(((ws ?? []) as { address: string; username: string | null; display_name: string | null; avatar_src: string | null }[]).map((w) => [w.address, w]));
      for (const id of ids) {
        const w = byW.get(id);
        if (!w || banned.has(id)) continue;
        who.push({ wallet: id, username: w.username, name: w.display_name, avatar: w.avatar_src, followers: counts.get(id) ?? 0 });
        if (who.length === 3) break;
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json({ trending, who });
}

/**
 * GET /api/search?q=…&type=all|tokens|posts|accounts
 * Recherche dans les tokens OMdotfun (nom, $TICKER), les posts (texte, #hashtag) et les comptes (@nom).
 * Requêtes courtes et limitées : pas de recherche plein texte lourde (serveur modeste).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfiles } from "@/lib/profiles";
import { rateHit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const LIVE = ["active", "graduating", "graduated"];
// Caractères qui casseraient un filtre ilike / or() de PostgREST
const clean = (s: string) => s.replace(/[%_,()*\\"'.:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = (url.searchParams.get("q") ?? "").trim();
  const type = url.searchParams.get("type") ?? "all";
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (!(await rateHit(`search:${ip}`, 60, 60_000))) return NextResponse.json({ error: "Too many searches, slow down" }, { status: 429 });

  const isTag = raw.startsWith("#");
  const isTicker = raw.startsWith("$");
  const isUser = raw.startsWith("@");
  const base = clean(raw.replace(/^[#$@]/, ""));
  // Noms courants d'un token dont le ticker est différent
  const q = isTicker && base.toUpperCase() === "CLAWDTRUST" ? "CLT" : base;
  if (q.length < 1) return NextResponse.json({ tokens: [], posts: [], accounts: [] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const want = (t: string) => type === "all" || type === t;

  const tokensP = want("tokens") && !isTag && !isUser
    ? admin.from("launchpad_tokens").select("id, name, ticker, logo_url, chain, mint_address, market_cap_usd, price_usd, is_hidden, status")
        .in("status", LIVE).or(isTicker ? `ticker.ilike.${q}%` : `ticker.ilike.${q}%,name.ilike.%${q}%`)
        .order("market_cap_usd", { ascending: false, nullsFirst: false }).limit(type === "tokens" ? 20 : 5)
    : Promise.resolve({ data: [] });

  const postsP = want("posts") && !isUser
    ? (isTag
        ? admin.from("posts").select("id, author, body, images, created_at, like_count, reply_count").eq("hidden", false).is("repost_of", null).contains("tags", [q.toLowerCase().replace(/\s/g, "")])
        : admin.from("posts").select("id, author, body, images, created_at, like_count, reply_count").eq("hidden", false).is("repost_of", null).ilike("body", `%${isTicker ? "$" + q : q}%`)
      ).order("created_at", { ascending: false }).limit(type === "posts" ? 25 : 5)
    : Promise.resolve({ data: [] });

  const usersP = want("accounts") && !isTag && !isTicker
    ? admin.from("wallets").select("address, username, display_name, avatar_src").or(`username.ilike.${q}%,display_name.ilike.${q}%`).limit(type === "accounts" ? 20 : 5)
    : Promise.resolve({ data: [] });

  const [t, p, u] = await Promise.all([tokensP, postsP, usersP]);

  const tokens = ((t.data ?? []) as { id: string; name: string; ticker: string; logo_url: string | null; chain: string; mint_address: string | null; market_cap_usd: number | null; price_usd: number | null; is_hidden: boolean | null }[])
    .filter((x) => !x.is_hidden)
    .map((x) => ({ id: x.id, name: x.name, ticker: x.ticker, logo: x.logo_url, chain: x.chain, market_cap_usd: x.market_cap_usd, price_usd: x.price_usd, href: `/launchpad/${x.mint_address ?? x.id}` }));

  const postRows = (p.data ?? []) as { id: string; author: string; body: string; images: string[] | null; created_at: string; like_count: number; reply_count: number }[];
  const userRows = (u.data ?? []) as { address: string; username: string | null; display_name: string | null; avatar_src: string | null }[];
  const profiles = await getProfiles(admin, [...postRows.map((r) => r.author), ...userRows.map((r) => r.address)]);

  const posts = postRows.map((r) => ({
    id: r.id, body: r.body.slice(0, 280), image: r.images?.[0] ?? null, created_at: r.created_at, like_count: r.like_count, reply_count: r.reply_count,
    author: r.author, author_name: profiles.get(r.author)?.name ?? null, author_avatar: profiles.get(r.author)?.avatar_src ?? null, author_octo: profiles.get(r.author)?.octo ?? 0,
  }));
  const accounts = userRows.map((r) => ({
    wallet: r.address, username: r.username, name: r.display_name ?? r.username, avatar: r.avatar_src, octo: profiles.get(r.address)?.octo ?? 0,
  }));

  return NextResponse.json({ tokens, posts, accounts });
}

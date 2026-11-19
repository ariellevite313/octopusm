/**
 * GET /api/search?q=…&type=all|tokens|posts|accounts
 * Recherche dans les tokens OMdotfun (nom, $TICKER, adresse) puis tous les tokens du Terminal (tous réseaux),
 * les posts (texte, #hashtag) et les comptes (@nom, nom affiché, adresse de wallet).
 * Requêtes courtes et limitées : pas de recherche plein texte lourde (serveur modeste).
 */
import { getIp } from "@/lib/v1/helpers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfiles } from "@/lib/profiles";
import { rateHit } from "@/lib/rate-limit";
import { selfUrl } from "@/lib/self-url";

export const dynamic = "force-dynamic";

const LIVE = ["active", "graduating", "graduated"];
// Caractères qui casseraient un filtre ilike / or() de PostgREST
const clean = (s: string) => s.replace(/[%_,()*\\"'.:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = (url.searchParams.get("q") ?? "").trim();
  const type = url.searchParams.get("type") ?? "all";
  const ip = getIp(req); // dernier saut, pas le premier (falsifiable par le client)
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
    ? admin.from("wallets").select("address, username, display_name, avatar_src").or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(type === "accounts" ? 20 : 5)
    : Promise.resolve({ data: [] });

  // Adresse collée (CA d'un token ou wallet d'un utilisateur)
  const addr = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw) || /^0x[0-9a-fA-F]{40}$/.test(raw) ? raw : null;
  const byAddrTokP = addr && want("tokens")
    ? (addr.startsWith("0x") ? admin.from("launchpad_tokens").select("id, name, ticker, logo_url, chain, mint_address, market_cap_usd, price_usd, is_hidden, status").ilike("mint_address", addr)
      : admin.from("launchpad_tokens").select("id, name, ticker, logo_url, chain, mint_address, market_cap_usd, price_usd, is_hidden, status").eq("mint_address", addr)).in("status", LIVE).limit(1)
    : Promise.resolve({ data: [] });
  const byAddrUserP = addr && want("accounts")
    ? (addr.startsWith("0x") ? admin.from("wallets").select("address, username, display_name, avatar_src").ilike("address", addr) : admin.from("wallets").select("address, username, display_name, avatar_src").eq("address", addr)).limit(1)
    : Promise.resolve({ data: [] });
  // Tous les tokens du Terminal (tous réseaux) : par nom, ticker ou adresse, après ceux d'OMdotfun
  const externalP: Promise<{ chain?: string; mint: string; symbol: string; name: string; logo: string | null; mcap: number | null; price: number | null; href?: string }[]> =
    want("tokens") && !isTag && !isUser && (addr || q.length >= 2)
      ? fetch(`${selfUrl()}/api/terminal?chains=all&q=${encodeURIComponent(addr ?? q)}`, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : { tokens: [] })).then((j) => j.tokens ?? []).catch(() => [])
      : Promise.resolve([]);

  const [t0, p, u0, ta, ua, ext] = await Promise.all([addr ? Promise.resolve({ data: [] }) : tokensP, postsP, addr ? Promise.resolve({ data: [] }) : usersP, byAddrTokP, byAddrUserP, externalP]);
  const t = { data: [...((ta.data ?? []) as unknown[]), ...((t0.data ?? []) as unknown[])] };
  const u = { data: [...((ua.data ?? []) as unknown[]), ...((u0.data ?? []) as unknown[])] };

  const tokens = ((t.data ?? []) as { id: string; name: string; ticker: string; logo_url: string | null; chain: string; mint_address: string | null; market_cap_usd: number | null; price_usd: number | null; is_hidden: boolean | null }[])
    .filter((x) => !x.is_hidden)
    .map((x) => ({ id: x.id, name: x.name, ticker: x.ticker, logo: x.logo_url, chain: x.chain, market_cap_usd: x.market_cap_usd, price_usd: x.price_usd, href: `/launchpad/${x.mint_address ?? x.id}`, mint: x.mint_address }));
  // Tokens du Terminal pas déjà listés (lancements OM en tête)
  const seen = new Set(tokens.map((x) => (x.mint ?? "").toLowerCase()));
  for (const e of ext) {
    if (!e.mint || seen.has(e.mint.toLowerCase())) continue;
    seen.add(e.mint.toLowerCase());
    const chain = e.chain ?? "solana";
    tokens.push({ id: `${chain}:${e.mint}`, name: e.name, ticker: e.symbol, logo: e.logo, chain, market_cap_usd: e.mcap, price_usd: e.price, href: e.href ?? `/terminal?${chain !== "solana" ? `chain=${chain}&` : ""}mint=${e.mint}`, mint: e.mint });
    if (tokens.length >= (type === "tokens" ? 25 : 8)) break;
  }

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

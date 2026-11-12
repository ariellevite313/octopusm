/**
 * GET /api/users/card?wallet=…  Carte de profil au survol : nom, @, photo, bio, abonnés / abonnements,
 * « te suit », abonnés en commun, communauté épinglée.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { normWallet } from "@/lib/social/posts";
import { getProfiles } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("wallet") ?? "";
  if (!/^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(raw)) return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  const wallet = normWallet(raw);
  const v = await getWalletAddress();
  const viewer = v ? normWallet(v) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const [w, followers, following, iFollow, followsMe, myFollows] = await Promise.all([
    db.from("wallets").select("address, username, display_name, avatar_src, banner_src, created_at").eq("address", wallet).maybeSingle(),
    db.from("follows").select("follower", { count: "exact", head: true }).eq("following", wallet),
    db.from("follows").select("following", { count: "exact", head: true }).eq("follower", wallet),
    viewer ? db.from("follows").select("follower").eq("follower", viewer).eq("following", wallet).maybeSingle() : Promise.resolve({ data: null }),
    viewer ? db.from("follows").select("follower").eq("follower", wallet).eq("following", viewer).maybeSingle() : Promise.resolve({ data: null }),
    viewer ? db.from("follows").select("following").eq("follower", viewer).limit(2000) : Promise.resolve({ data: [] }),
  ]);
  if (!w.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Abonnés en commun : les comptes que je suis et qui suivent ce profil
  let mutual: { name: string | null; avatar: string | null }[] = [];
  let mutualCount = 0;
  const mine = ((myFollows.data ?? []) as { following: string }[]).map((f) => f.following);
  if (viewer && viewer !== wallet && mine.length) {
    const { data: m, count } = await db.from("follows").select("follower", { count: "exact" }).eq("following", wallet).in("follower", mine.slice(0, 1000)).limit(3);
    const prof = await getProfiles(db, ((m ?? []) as { follower: string }[]).map((r) => r.follower));
    mutual = [...prof.values()].map((p) => ({ name: p.name, avatar: p.avatar_src }));
    mutualCount = count ?? mutual.length;
  }

  // Bio et communauté épinglée (après la migration des communautés)
  let bio: string | null = null;
  let community: { slug: string; name: string; logo_src: string | null } | null = null;
  try {
    const { data: x } = await db.from("wallets").select("bio, pinned_community_id").eq("address", wallet).maybeSingle();
    bio = x?.bio ?? null;
    if (x?.pinned_community_id) {
      const { data: c } = await db.from("communities").select("slug, name, logo_src").eq("id", x.pinned_community_id).eq("hidden", false).maybeSingle();
      community = c ?? null;
    }
  } catch { /* avant migration */ }

  return NextResponse.json({
    wallet, username: w.data.username, name: w.data.display_name || w.data.username || null, avatar: w.data.avatar_src, bio,
    followers: followers.count ?? 0, following: following.count ?? 0,
    is_following: !!iFollow.data, follows_you: !!followsMe.data, mine: viewer === wallet,
    mutual, mutual_count: mutualCount, community,
  }, { headers: { "Cache-Control": "private, max-age=30" } });
}

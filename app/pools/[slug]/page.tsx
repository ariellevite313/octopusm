import type { Metadata } from "next";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { MutuelMarketRow } from "@/lib/supabase/types";
import type { MarketCommentEnriched } from "@/lib/supabase/types";
import { PoolDetailClient } from "@/components/pools/pool-detail-client";
import { notFound } from "next/navigation";

export const revalidate = 0;

async function getPoolBySlug(slug: string): Promise<MutuelMarketRow | null> {
  const supabase = await createClient() as any;
  const { data } = await supabase
    .from("mutuel_markets")
    .select("*")
    .eq("slug", slug)
    .in("status", ["active", "closed", "resolved", "cancelled"])
    .single();
  if (!data) return null;
  return {
    ...data,
    options: typeof data.options === "string" ? JSON.parse(data.options) : data.options,
  };
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pool = await getPoolBySlug(slug);
  if (!pool) return { title: "Pool not found" };

  const ogImage = `/api/og/market/${slug}`;

  return {
    title: pool.title,
    description: pool.description ?? "Pari mutuel pool on Octo Market. Pick your outcome and share the winnings.",
    openGraph: {
      title: pool.title,
      description: pool.description ?? "Pari mutuel pool on Octo Market.",
      url: `/pools/${slug}`,
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630, alt: pool.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: pool.title,
      description: pool.description ?? "Pari mutuel pool on Octo Market.",
      images: [ogImage],
    },
  };
}

async function getInitialBets(marketId: string) {
  const supabase = await createClient() as any;
  const { data } = await supabase
    .from("mutuel_bets")
    .select("option_id, amount, token, wallet_address, created_at, payout_amount, paid_at")
    .eq("market_id", marketId)
    .order("created_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

async function getInitialComments(marketId: string, wallet: string | null): Promise<MarketCommentEnriched[]> {
  const admin = createAdminClient() as any;

  const { data: rows } = await admin
    .from("mutuel_market_comments")
    .select("*")
    .eq("market_id", marketId)
    .order("created_at", { ascending: true });

  const comments = (rows ?? []) as Array<Record<string, unknown>>;

  let likedSet = new Set<string>();
  if (wallet) {
    const { data: likes } = await admin
      .from("mutuel_market_comment_likes")
      .select("comment_id")
      .eq("wallet_address", wallet);
    likedSet = new Set((likes ?? []).map((l: { comment_id: string }) => l.comment_id));
  }

  const byId: Record<string, MarketCommentEnriched> = {};
  const topLevel: MarketCommentEnriched[] = [];

  for (const c of comments) {
    const enriched: MarketCommentEnriched = {
      id:             c.id as string,
      market_id:      c.market_id as string,
      wallet_address: c.wallet_address as string,
      username:       c.username as string | null,
      avatar_src:     c.avatar_src as string | null,
      content:        c.content as string,
      parent_id:      c.parent_id as string | null,
      like_count:     c.like_count as number,
      created_at:     c.created_at as string,
      liked_by_me:    likedSet.has(c.id as string),
      replies:        [],
    };
    byId[enriched.id] = enriched;
    if (!c.parent_id) topLevel.push(enriched);
  }

  for (const c of comments) {
    if (c.parent_id && byId[c.parent_id as string] && byId[c.id as string]) {
      byId[c.parent_id as string].replies.push(byId[c.id as string]);
    }
  }

  return topLevel;
}

export default async function PoolDetailPage(
  { params }: Props
) {
  const { slug } = await params;

  // Auth — get wallet for liked_by_me
  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;

  const market = await getPoolBySlug(slug);
  if (!market) notFound();

  const [bets, comments] = await Promise.all([
    getInitialBets(market.id),
    getInitialComments(market.id, wallet),
  ]);

  return (
    <PoolDetailClient
      market={market}
      initialBets={bets}
      initialComments={comments}
    />
  );
}

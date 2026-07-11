import { createClient } from "@/lib/supabase/server";
import type { PredictionMarketRow, MarketCommentRow, MarketCommentEnriched } from "@/lib/supabase/types";
import type { MarketVolumes } from "@/lib/market/utils";
export type { MarketOption, MarketVolumes } from "@/lib/market/utils";
export { parseMarketOptions } from "@/lib/market/utils";

// ─── Volume types ─────────────────────────────────────────────────────────────

export type OptionVolume = { usdc: number; clt: number };
export type MarketVolumeDetail = {
  total: OptionVolume;
  byOption: Record<string, OptionVolume>;
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getMarketBySlug(slug: string): Promise<PredictionMarketRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("prediction_markets")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!error && data) return data;

  const { data: byId } = await supabase
    .from("prediction_markets")
    .select("*")
    .eq("id", slug)
    .maybeSingle();

  return byId ?? null;
}

export async function getActiveMarkets(): Promise<PredictionMarketRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prediction_markets")
    .select("*")
    .eq("is_active", true)
    .eq("is_resolved", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[prediction-service] getActiveMarkets:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getResolvedMarkets(limit = 100): Promise<PredictionMarketRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prediction_markets")
    .select("*")
    .eq("is_resolved", true)
    .order("resolved_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[prediction-service] getResolvedMarkets:", error.message);
    return [];
  }
  return data ?? [];
}

/** Volume agrege par marche (home page) */
export async function getMarketVolumes(): Promise<MarketVolumes> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("prediction_history")
    .select("market_id, token, total_charged");

  if (error || !data) return {};

  const result: MarketVolumes = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of data as any[]) {
    if (!result[row.market_id]) result[row.market_id] = { usdc: 0, clt: 0 };
    const charged = (row.total_charged as number) ?? 0;
    if (row.token === "usdc") result[row.market_id].usdc += charged;
    else if (row.token === "clawdtrust") result[row.market_id].clt += charged;
  }
  return result;
}

/** Volume detaille pour une page marche (total + par option) */
export async function getMarketVolumeDetail(marketId: string): Promise<MarketVolumeDetail> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("prediction_history")
    .select("selection_id, token, total_charged")
    .eq("market_id", marketId);

  const empty: MarketVolumeDetail = { total: { usdc: 0, clt: 0 }, byOption: {} };
  if (error || !data) return empty;

  const result: MarketVolumeDetail = { total: { usdc: 0, clt: 0 }, byOption: {} };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of data as any[]) {
    const charged = (row.total_charged as number) ?? 0;
    const optId   = row.selection_id as string;
    if (!result.byOption[optId]) result.byOption[optId] = { usdc: 0, clt: 0 };

    if (row.token === "usdc") {
      result.total.usdc += charged;
      result.byOption[optId].usdc += charged;
    } else if (row.token === "clawdtrust") {
      result.total.clt += charged;
      result.byOption[optId].clt += charged;
    }
  }
  return result;
}

/**
 * Commentaires d'un marche enrichis : likes + reponses imbriquees.
 * Les racines sont triees du plus recent au plus ancien.
 * Les reponses sont triees du plus ancien au plus recent (ordre chronologique).
 */
export async function getMarketComments(marketId: string): Promise<MarketCommentEnriched[]> {
  const supabase = await createClient();

  // Fetch all comments (roots + replies)
  const { data: comments, error: commentsError } = await supabase
    .from("market_comments")
    .select("*")
    .eq("market_id", marketId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (commentsError || !comments) {
    console.error("[prediction-service] getMarketComments:", commentsError?.message);
    return [];
  }

  // Fetch all likes for this market's comments
  const commentIds = (comments as MarketCommentRow[]).map((c) => c.id);
  const { data: likes } = commentIds.length
    ? await supabase
        .from("market_comment_likes")
        .select("comment_id, wallet_address")
        .in("comment_id", commentIds)
    : { data: [] };

  // Current wallet (null if unauthenticated)
  let myWallet: string | null = null;
  try {
    const { data: w } = await supabase.rpc("get_wallet_address");
    myWallet = (w as unknown as string) ?? null;
  } catch { /* not authenticated */ }

  // Build like maps
  const likeCountMap: Record<string, number> = {};
  const likedByMeSet = new Set<string>();
  for (const like of (likes ?? []) as { comment_id: string; wallet_address: string }[]) {
    likeCountMap[like.comment_id] = (likeCountMap[like.comment_id] ?? 0) + 1;
    if (myWallet && like.wallet_address === myWallet) likedByMeSet.add(like.comment_id);
  }

  // Fetch OCTO balances for all commenters from leaderboard_octo view
  const uniqueWallets = [...new Set((comments as MarketCommentRow[]).map((c) => c.wallet_address))];
  const octoMap: Record<string, number> = {};
  if (uniqueWallets.length > 0) {
    const { data: octoRows } = await (supabase as any)
      .from("leaderboard_octo")
      .select("wallet_address, total_octo")
      .in("wallet_address", uniqueWallets);
    for (const w of (octoRows ?? []) as { wallet_address: string; total_octo: number | null }[]) {
      octoMap[w.wallet_address] = w.total_octo ?? 0;
    }
  }

  // Build enriched flat list
  const enriched: MarketCommentEnriched[] = (comments as MarketCommentRow[]).map((c) => ({
    ...c,
    like_count: likeCountMap[c.id] ?? 0,
    liked_by_me: likedByMeSet.has(c.id),
    octo_balance: octoMap[c.wallet_address] ?? 0,
    replies: [],
  }));

  // Nest replies under their parent
  const byId: Record<string, MarketCommentEnriched> = {};
  for (const c of enriched) byId[c.id] = c;

  const roots: MarketCommentEnriched[] = [];
  for (const c of enriched) {
    if (c.parent_id && byId[c.parent_id]) {
      byId[c.parent_id].replies.push(c);
    } else {
      roots.push(c);
    }
  }

  // Roots: newest first — replies: chronological (already sorted asc from DB)
  roots.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return roots;
}

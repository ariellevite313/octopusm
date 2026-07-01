/**
 * leaderboard-service.ts
 * Requetes sur la vue leaderboard_octo (Supabase).
 */

import { supabase } from "@/lib/supabase";

export interface LeaderboardEntry {
  rank: number;
  wallet_address: string;
  display_name: string | null;
  avatar_src: string | null;
  total_octo: number;
  win_count: number;
}

/**
 * Retourne les N premiers du classement OCTO.
 */
export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from("leaderboard_octo")
    .select("rank, wallet_address, display_name, avatar_src, total_octo, win_count")
    .order("rank", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[leaderboard-service] getLeaderboard:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    rank: Number(row.rank),
    wallet_address: row.wallet_address ?? "",
    display_name: row.display_name ?? null,
    avatar_src: row.avatar_src ?? null,
    total_octo: Number(row.total_octo ?? 0),
    win_count: Number(row.win_count ?? 0),
  }));
}

/**
 * Retourne la position du wallet connecte dans le classement.
 * Retourne null si le wallet n'a pas de gains OCTO.
 */
export async function getWalletLeaderboardRank(
  walletAddress: string
): Promise<LeaderboardEntry | null> {
  const { data, error } = await supabase
    .from("leaderboard_octo")
    .select("rank, wallet_address, display_name, avatar_src, total_octo, win_count")
    .eq("wallet_address", walletAddress)
    .maybeSingle();

  if (error) {
    console.error("[leaderboard-service] getWalletLeaderboardRank:", error.message);
    return null;
  }

  if (!data) return null;

  return {
    rank: Number(data.rank),
    wallet_address: data.wallet_address ?? walletAddress,
    display_name: data.display_name ?? null,
    avatar_src: data.avatar_src ?? null,
    total_octo: Number(data.total_octo ?? 0),
    win_count: Number(data.win_count ?? 0),
  };
}

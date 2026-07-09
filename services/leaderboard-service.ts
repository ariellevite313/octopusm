import { createClient } from "@/lib/supabase/server";

export interface LeaderboardEntry {
  rank: number;
  wallet_address: string;
  display_name: string | null;
  avatar_src: string | null;
  total_octo: number;
  win_count: number;
}

export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from("leaderboard_octo")
    .select("rank, wallet_address, display_name, avatar_src, total_octo, win_count")
    .order("rank", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[leaderboard-service]", error.message);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    rank:           Number(row.rank),
    wallet_address: row.wallet_address ?? "",
    display_name:   row.display_name   ?? null,
    avatar_src:     row.avatar_src     ?? null,
    total_octo:     Number(row.total_octo  ?? 0),
    win_count:      Number(row.win_count   ?? 0),
  }));
}

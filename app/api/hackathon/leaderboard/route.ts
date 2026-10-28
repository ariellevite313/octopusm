/** GET /api/hackathon/leaderboard : classement et cagnotte en direct (public). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { loadBoard } from "@/lib/hackathon/leaderboard";

export const revalidate = 30;

export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const board = await loadBoard(createAdminClient() as any);
    return NextResponse.json(board, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch (e) {
    console.error("[hackathon/leaderboard]", e);
    return NextResponse.json({ error: "Could not load the leaderboard" }, { status: 500 });
  }
}

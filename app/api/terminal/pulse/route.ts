/** GET /api/terminal/pulse : nouveaux tokens, proches de la graduation, tout juste migrés (Solana). */
import { NextResponse } from "next/server";
import { limited } from "@/lib/limit";
import { pulse } from "@/lib/terminal-pulse";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  { const lim = await limited(req, "pulse", 60); if (lim) return lim; }
  return NextResponse.json(await pulse(), { headers: { "Cache-Control": "public, max-age=10, s-maxage=15" } });
}

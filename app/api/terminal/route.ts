/** GET /api/terminal?list=trending|new  ou  ?q=… : tokens Solana pour le Terminal OM. */
import { NextResponse } from "next/server";
import { terminalList } from "@/lib/terminal";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 60);
  const list = u.searchParams.get("list") === "new" ? "new" : "trending";
  try {
    const tokens = q.length >= 2 ? await terminalList("search", q) : await terminalList(list);
    return NextResponse.json({ tokens }, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch {
    return NextResponse.json({ tokens: [], error: "Market data unavailable" }, { status: 502 });
  }
}

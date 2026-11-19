/** GET /api/terminal/security?chain=solana&mint=… : fiche sécurité d'un token (voir lib/terminal-security). */
import { NextResponse } from "next/server";
import { limited } from "@/lib/limit";
import { tokenSecurity } from "@/lib/terminal-security";

export async function GET(req: Request) {
  { const lim = await limited(req, "security", 60); if (lim) return lim; }
  const u = new URL(req.url);
  const s = await tokenSecurity(u.searchParams.get("chain") ?? "solana", (u.searchParams.get("mint") ?? "").trim());
  if (!s) return NextResponse.json({ available: false }, { headers: { "Cache-Control": "public, max-age=60" } });
  return NextResponse.json({ available: true, ...s }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=120" } });
}

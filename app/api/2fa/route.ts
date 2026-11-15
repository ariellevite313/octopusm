/**
 * GET  /api/2fa : la double vérification est-elle active ?
 * POST /api/2fa { action: "setup" }            → QR code (pas encore actif)
 *               { action: "enable", code }     → active et renvoie les 8 codes de secours (une seule fois)
 *               { action: "disable", code }    → désactive (code ou code de secours obligatoire)
 */
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireWallet } from "@/lib/social/session";
import { rateHit } from "@/lib/rate-limit";
import { beginSetup, disable, enable, status, TwoFaError } from "@/lib/twofa";
import { AgentKeyError } from "@/lib/agent-wallet/keys";

export const dynamic = "force-dynamic";
const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET() {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  return NextResponse.json(await status(s.wallet), noStore);
}

export async function POST(req: Request) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  if (!(await rateHit(`2fa:${s.wallet}`, 10, 600_000))) return NextResponse.json({ error: "Too many tries, wait a few minutes" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; code?: unknown };
  const code = typeof b.code === "string" ? b.code.slice(0, 20) : "";
  try {
    if (b.action === "setup") {
      const label = `${s.wallet.slice(0, 4)}…${s.wallet.slice(-4)}`;
      const { secret, uri } = await beginSetup(s.wallet, label);
      return NextResponse.json({ secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 240 }) }, noStore);
    }
    if (b.action === "enable") return NextResponse.json({ ok: true, recovery: await enable(s.wallet, code) }, noStore);
    if (b.action === "disable") { await disable(s.wallet, code); return NextResponse.json({ ok: true }, noStore); }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    if (e instanceof TwoFaError || e instanceof AgentKeyError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[2fa]", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

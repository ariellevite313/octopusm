/**
 * POST /api/launchpad/ticker-request { ticker, x_handle, contact?, message? }
 * Demande d'une équipe DRC-20 pour lancer son ticker réservé sur OM. L'admin vérifie (compte X du projet) puis valide.
 */
import { NextResponse } from "next/server";
import { requireWallet } from "@/lib/social/session";
import { createAdminClient } from "@/lib/supabase/server";
import { normTicker, reservedTicker } from "@/lib/launch/reserved-tickers";
import { getWalletAddress } from "@/lib/auth/get-wallet";

export const dynamic = "force-dynamic";

/** GET ?ticker=DOGI : ce ticker est-il réservé, le wallet connecté peut-il le lancer, une demande est-elle en attente ? */
export async function GET(req: Request) {
  const ticker = normTicker(new URL(req.url).searchParams.get("ticker") ?? "");
  if (!ticker || ticker.length > 20) return NextResponse.json({ reserved: false });
  const wallet = await getWalletAddress().catch(() => null);
  const r = await reservedTicker(ticker, wallet);
  if (!r.reserved) return NextResponse.json({ reserved: false });
  let pending = false;
  if (wallet && !r.allowed) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data } = await db.from("ticker_requests").select("id").eq("ticker", ticker).eq("wallet", wallet).eq("status", "pending").limit(1);
    pending = !!data?.length;
  }
  return NextResponse.json({ reserved: true, allowed: r.allowed, pending, original: r.original });
}

export async function POST(req: Request) {
  const who = await requireWallet();
  if ("error" in who) return who.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ticker = normTicker(String(b.ticker ?? ""));
  const x = String(b.x_handle ?? "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").split(/[/?#]/)[0];
  const contact = String(b.contact ?? "").trim().slice(0, 120) || null;
  const message = String(b.message ?? "").trim().slice(0, 600) || null;
  if (!ticker) return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
  if (!/^\w{1,15}$/.test(x)) return NextResponse.json({ error: "Enter the project's X account" }, { status: 400 });
  const r = await reservedTicker(ticker, who.wallet);
  if (!r.reserved) return NextResponse.json({ error: "This ticker is not reserved" }, { status: 400 });
  if (r.allowed) return NextResponse.json({ ok: true, approved: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db.from("ticker_requests").insert({ ticker, wallet: who.wallet, x_handle: x, contact, message });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return NextResponse.json({ ok: true, pending: true });
    console.error("[ticker-request]", error.message);
    return NextResponse.json({ error: "Could not send your request" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, pending: true });
}

/**
 * Sorties automatiques du wallet de l'IA, fixées par l'humain (Janus ne fait que les exécuter) :
 * GET liste, POST crée (stop loss, take profit, protection des gains), DELETE ?rule= annule.
 */
import { NextResponse } from "next/server";
import { requireWallet } from "@/lib/social/session";
import { AgentWalletError, walletOfOwner } from "@/lib/agent-wallet/server";
import { cancelExit, listExits, setExit } from "@/lib/agent-wallet/exits";
import { requireSecondFactor } from "@/lib/twofa";

export const dynamic = "force-dynamic";
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const fail = (e: unknown) => NextResponse.json({ error: e instanceof AgentWalletError ? e.message : "Could not save" }, { status: 400 });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  try {
    const w = await walletOfOwner(s.wallet, (await params).id);
    return NextResponse.json({ exits: await listExits(w, new URL(req.url).searchParams.get("all") === "1") });
  } catch (e) { return fail(e); }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const f = await requireSecondFactor(s.wallet, req);
  if (f) return f;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const mint = String(b.mint ?? "");
  if (!MINT.test(mint)) return NextResponse.json({ error: "mint must be a Solana token address" }, { status: 400 });
  const n = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v));
  try {
    const w = await walletOfOwner(s.wallet, (await params).id);
    const r = await setExit(w, { mint, stop_loss_pct: n(b.stop_loss_pct), take_profit_x: n(b.take_profit_x), take_profit_sell_pct: n(b.take_profit_sell_pct), trailing_pct: n(b.trailing_pct), symbol: typeof b.symbol === "string" ? b.symbol : undefined });
    return NextResponse.json({ ok: true, exit: r });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const rule = new URL(req.url).searchParams.get("rule") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(rule)) return NextResponse.json({ error: "rule required" }, { status: 400 });
  try {
    const w = await walletOfOwner(s.wallet, (await params).id);
    await cancelExit(w, rule);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}

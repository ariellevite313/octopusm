/**
 * Alertes de capitalisation du wallet connecté.
 * GET ?mint= (facultatif) : mes alertes actives. POST { chain, mint, symbol, kind, value }. DELETE { id }.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";

export const dynamic = "force-dynamic";
const ADDR = /^([1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-fA-F]{40})$/;
const CHAINS = new Set(["solana", "base", "bnb", "ethereum", "arbitrum", "polygon", "avalanche", "hyperliquid"]);
const MAX = 20;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any;

export async function GET(req: Request) {
  const wallet = await getWalletAddress();
  if (!wallet) return NextResponse.json({ alerts: [] });
  const mint = new URL(req.url).searchParams.get("mint");
  let q = db().from("terminal_alerts").select("id, chain, mint, symbol, kind, value, created_at").eq("wallet", wallet).is("triggered_at", null);
  if (mint && ADDR.test(mint)) q = q.eq("mint", mint);
  const { data } = await q.order("created_at", { ascending: false }).limit(MAX);
  return NextResponse.json({ alerts: data ?? [] });
}

export async function POST(req: Request) {
  const wallet = await getWalletAddress();
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const chain = String(b.chain ?? "solana"), mint = String(b.mint ?? ""), kind = String(b.kind ?? ""), value = Number(b.value);
  if (!CHAINS.has(chain) || !ADDR.test(mint) || (kind !== "mcap_above" && kind !== "mcap_below") || !Number.isFinite(value) || value <= 0 || value > 1e13) {
    return NextResponse.json({ error: "Invalid alert" }, { status: 400 });
  }
  const { count } = await db().from("terminal_alerts").select("id", { count: "exact", head: true }).eq("wallet", wallet).is("triggered_at", null);
  if ((count ?? 0) >= MAX) return NextResponse.json({ error: `${MAX} active alerts maximum` }, { status: 429 });
  const symbol = String(b.symbol ?? "").replace(/[^\p{L}\p{N}_.$-]/gu, "").slice(0, 16) || null;
  const { data, error } = await db().from("terminal_alerts").insert({ wallet, chain, mint, symbol, kind, value }).select("id").single();
  if (error) return NextResponse.json({ error: "Could not save the alert" }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

export async function DELETE(req: Request) {
  const wallet = await getWalletAddress();
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await db().from("terminal_alerts").delete().eq("id", id).eq("wallet", wallet);
  return NextResponse.json({ ok: true });
}

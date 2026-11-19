/**
 * Wallets suivis par le wallet connecté (Solana) : une notification à chaque achat ou vente de token.
 * GET : ma liste. POST { address, label }. DELETE { id }.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";

export const dynamic = "force-dynamic";
const SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX = 10;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any;

export async function GET() {
  const wallet = await getWalletAddress();
  if (!wallet) return NextResponse.json({ wallets: [] });
  const { data } = await db().from("tracked_wallets").select("id, address, label, created_at").eq("owner", wallet).order("created_at", { ascending: false });
  return NextResponse.json({ wallets: data ?? [] });
}

export async function POST(req: Request) {
  const wallet = await getWalletAddress();
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const address = String(b.address ?? "").trim();
  if (!SOL.test(address)) return NextResponse.json({ error: "Invalid Solana address" }, { status: 400 });
  if (address === wallet) return NextResponse.json({ error: "That is your own wallet" }, { status: 400 });
  const label = String(b.label ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 24) || null;
  const { count } = await db().from("tracked_wallets").select("id", { count: "exact", head: true }).eq("owner", wallet);
  if ((count ?? 0) >= MAX) return NextResponse.json({ error: `${MAX} wallets maximum` }, { status: 429 });
  const { error } = await db().from("tracked_wallets").insert({ owner: wallet, address, label });
  if (error) return NextResponse.json({ error: error.code === "23505" ? "Already tracked" : "Could not save" }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const wallet = await getWalletAddress();
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await db().from("tracked_wallets").delete().eq("id", id).eq("owner", wallet);
  return NextResponse.json({ ok: true });
}

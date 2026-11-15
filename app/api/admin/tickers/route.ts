/**
 * GET  /api/admin/tickers   demandes pour les tickers réservés (DRC-20)
 * POST /api/admin/tickers   { action: "approve" | "reject", id }   approve : le wallet demandeur peut lancer ce ticker
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const [{ data: requests }, { data: reserved }] = await Promise.all([
    db.from("ticker_requests").select("*").order("created_at", { ascending: false }).limit(200),
    db.from("reserved_tickers").select("ticker, original, rank, x_handle, allowed_wallets").order("rank", { ascending: true }),
  ]);
  return NextResponse.json({ requests: requests ?? [], reserved: reserved ?? [] });
}

export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string };
  if (!b.id || (b.action !== "approve" && b.action !== "reject")) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: r } = await db.from("ticker_requests").select("*").eq("id", b.id).maybeSingle();
  if (!r) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (b.action === "approve") {
    const { data: t } = await db.from("reserved_tickers").select("allowed_wallets, x_handle").eq("ticker", r.ticker).maybeSingle();
    const wallets = Array.from(new Set([...(t?.allowed_wallets ?? []), r.wallet]));
    const { error } = await db.from("reserved_tickers").update({ allowed_wallets: wallets, x_handle: t?.x_handle ?? r.x_handle }).eq("ticker", r.ticker);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await db.from("ticker_requests").update({ status: b.action === "approve" ? "approved" : "rejected", reviewed_at: new Date().toISOString() }).eq("id", b.id);
  return NextResponse.json({ ok: true });
}

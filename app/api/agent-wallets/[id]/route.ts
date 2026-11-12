/** PATCH /api/agent-wallets/[id] : plafonds, permissions, pause (uniquement par l'humain qui a connecté l'IA). */
import { NextResponse } from "next/server";
import { requireWallet } from "@/lib/social/session";
import { AgentWalletError, updateWallet } from "@/lib/agent-wallet/server";
import { parseLimits } from "@/lib/agent-wallet/limits";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const { id } = await params;
  const p = parseLimits((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
  if (!Object.keys(p.v).length) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  try { await updateWallet(s.wallet, id, p.v); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: e instanceof AgentWalletError ? e.message : "Could not save" }, { status: 400 }); }
}

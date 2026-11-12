/**
 * GET  /api/agent-wallets : wallets des IA que j'ai connectées (adresses, soldes, plafonds, dernières actions).
 * POST /api/agent-wallets { client_id } : créer le wallet de cette IA.
 * Les clés ne sortent jamais du serveur.
 */
import { NextResponse } from "next/server";
import { requireWallet } from "@/lib/social/session";
import { AgentWalletError, createWallet, listForOwner } from "@/lib/agent-wallet/server";
import { AgentKeyError } from "@/lib/agent-wallet/keys";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  return NextResponse.json({ wallets: await listForOwner(s.wallet) });
}

export async function POST(req: Request) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const b = (await req.json().catch(() => ({}))) as { client_id?: unknown };
  if (typeof b.client_id !== "string" || !b.client_id || b.client_id.length > 200) return NextResponse.json({ error: "client_id required" }, { status: 400 });
  try {
    const w = await createWallet(s.wallet, b.client_id);
    return NextResponse.json({ ok: true, id: w.id, sol_address: w.sol_address, evm_address: w.evm_address });
  } catch (e) {
    if (e instanceof AgentWalletError || e instanceof AgentKeyError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[agent-wallets] create:", e);
    return NextResponse.json({ error: "Could not create the wallet" }, { status: 500 });
  }
}

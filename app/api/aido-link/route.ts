/**
 * POST   /api/aido-link { message, signature } : relier mon compte Aido (signature du wallet Arc d'Aido).
 * DELETE /api/aido-link : retirer le lien.
 */
import { NextResponse } from "next/server";
import { recoverMessageAddress, type Hex } from "viem";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { parseAidoMessage } from "@/lib/aido-link";

export async function POST(req: Request) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const b = (await req.json().catch(() => ({}))) as { message?: unknown; signature?: unknown };
  if (typeof b.message !== "string" || b.message.length > 400 || typeof b.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(b.signature)) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }
  const p = parseAidoMessage(b.message, s.wallet);
  if ("error" in p) return NextResponse.json({ error: p.error }, { status: 400 });
  const signer = await recoverMessageAddress({ message: b.message, signature: b.signature as Hex }).catch(() => null);
  if (!signer || signer.toLowerCase() !== p.aido) return NextResponse.json({ error: "The signature does not match this Aido wallet" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: other } = await admin.from("aido_links").select("wallet").eq("aido_address", p.aido).maybeSingle();
  if (other && other.wallet !== s.wallet) return NextResponse.json({ error: "This Aido account is already linked to another OM account" }, { status: 409 });
  const { error } = await admin.from("aido_links").upsert({ wallet: s.wallet, aido_address: p.aido, signature: b.signature, message: b.message, linked_at: new Date().toISOString() }, { onConflict: "wallet" });
  if (error) return NextResponse.json({ error: "Could not save the link" }, { status: 500 });
  return NextResponse.json({ ok: true, aido_address: p.aido });
}

export async function DELETE() {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (createAdminClient() as any).from("aido_links").delete().eq("wallet", s.wallet);
  return NextResponse.json({ ok: true });
}

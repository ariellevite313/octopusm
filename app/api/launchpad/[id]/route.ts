/**
 * DELETE /api/launchpad/[id]
 *
 * Permanently deletes a cancelled launchpad token from the DB.
 * Admin-only. Token must have status = 'cancelled'.
 */
import { NextResponse } from "next/server";
import { solanaConnection } from "@/lib/solana/rpc";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth/require-admin";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;

  const denied = await requireAdminApi();
  if (denied) return denied;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    const { data: token, error: fetchError } = await admin
      .from("launchpad_tokens")
      .select("id, status, chain, mint_address")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    const deletableStatuses = ["cancelled", "pending"];
    if (!deletableStatuses.includes(token.status as string)) {
      return NextResponse.json(
        { error: "Only pending or cancelled tokens can be deleted" },
        { status: 409 },
      );
    }

    // Un token Solana dont la mint existe sur la chaîne est déjà lancé (la pool crée la mint) :
    // le supprimer casserait son nom et son image partout (l'adresse des métadonnées pointe vers cette ligne).
    if (token.chain !== "arc" && token.mint_address && process.env.SOLANA_RPC_URL) {
      try {
        const { Connection, PublicKey } = await import("@solana/web3.js");
        const info = await solanaConnection().getAccountInfo(new PublicKey(token.mint_address as string));
        if (info !== null) {
          return NextResponse.json(
            { error: "This token is already live on chain. It will be activated by the recovery task, do not delete it." },
            { status: 409 },
          );
        }
      } catch (e) { console.warn("[launchpad DELETE] on-chain check failed:", e); }
    }

    const { error: deleteError } = await admin
      .from("launchpad_tokens")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("launchpad DELETE error:", deleteError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("launchpad DELETE unexpected error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

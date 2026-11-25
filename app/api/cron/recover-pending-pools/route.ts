/**
 * GET /api/cron/recover-pending-pools
 *
 * Rattrape les lancements Solana restés "pending" alors que la pool existe déjà sur la chaîne
 * (wallet fermé avant la confirmation, erreur réseau, etc.) : le token est activé sans action du créateur.
 * Sécurisé par CRON_SECRET. À appeler toutes les 5 minutes.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { cronDenied } from "@/lib/auth/cron";
import { recoverPendingToken } from "@/lib/launch/recover-pool";

export async function GET(req: Request) {
  const denied = cronDenied(req);
  if (denied) return denied;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    // 60 jours : rattrape aussi les lancements bloqués avant les correctifs.
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const olderThan = new Date(Date.now() - 2 * 60_000).toISOString();
    const { data, error } = await admin
      .from("launchpad_tokens")
      .select("id, ticker, status, creator_wallet, mint_address, tx_base64, is_scheduled, stock_symbol, dbc_config_address")
      .eq("status", "pending")
      .eq("chain", "solana")
      .not("mint_address", "is", null)
      .gte("created_at", since)
      .lte("created_at", olderThan)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    let activated = 0;
    // Raison par token quand il n'est pas activé (no_pool, fee_missing, creator_mismatch...), pour comprendre sans lire les logs.
    const skipped: { ticker: string; reason: string }[] = [];
    for (const t of data ?? []) {
      try {
        const r = await recoverPendingToken(admin, t);
        if ("pool" in r) activated++; else skipped.push({ ticker: t.ticker, reason: r.reason });
      } catch (e) { console.warn("[recover-pending-pools]", t.id, e); skipped.push({ ticker: t.ticker, reason: "error" }); }
    }
    console.log(`[recover-pending-pools] checked=${data?.length ?? 0} activated=${activated}`);
    return NextResponse.json({ checked: data?.length ?? 0, activated, skipped });
  } catch (err) {
    console.error("[recover-pending-pools]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

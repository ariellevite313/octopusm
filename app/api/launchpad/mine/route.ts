/**
 * GET /api/launchpad/mine
 *
 * Returns all launchpad tokens created by the authenticated wallet.
 * Wallet is read from the Supabase session — never from query params.
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { activateIfPoolExists } from "@/lib/launch/recover-pool";

export async function GET() {
  try {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.app_metadata?.wallet_address ?? null;

  if (!wallet) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("launchpad_tokens")
    .select(
      "id, name, ticker, category, logo_url, status, is_tradeable, is_scheduled, scheduled_at, mint_address, pool_address, arc_launch_id, creator_wallet, supply, created_at, stock_symbol, chain"
    )
    .ilike("creator_wallet", wallet)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("launchpad/mine error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Lancements Solana restés « pending » alors que la pool existe déjà : activés ici, sans attendre le cron.
  const rows = (data ?? []) as Array<{ id: string; status: string; chain?: string; mint_address?: string | null; created_at: string }>;
  const stuck = rows.filter((t) => t.status === "pending" && (t.chain ?? "solana") === "solana" && t.mint_address && Date.now() - Date.parse(t.created_at) > 60_000).slice(0, 5);
  if (stuck.length) {
    const { data: full } = await admin
      .from("launchpad_tokens")
      .select("id, status, creator_wallet, mint_address, tx_base64, is_scheduled, stock_symbol, dbc_config_address")
      .in("id", stuck.map((t) => t.id));
    const fixed = await Promise.all((full ?? []).map(async (t: Parameters<typeof activateIfPoolExists>[1]) => {
      try { return (await activateIfPoolExists(admin, t)) ? t.id : null; } catch { return null; }
    }));
    const ok = new Set(fixed.filter(Boolean));
    if (ok.size) for (const r of rows) if (ok.has(r.id)) r.status = "active";
  }

  return NextResponse.json(rows);
  } catch (err) {
    console.error("[mine] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

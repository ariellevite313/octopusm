import type { Metadata } from "next";
import { requireAdmin } from "@/services/admin-service";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { AdminLaunchpadClient } from "@/components/admin/admin-launchpad-client";

export const metadata: Metadata = { title: "Launchpad — Admin" };
export const revalidate = 0;

const POOL_WARN_THRESHOLD = 20; // warn when fewer than 20 keypairs remain

export default async function AdminLaunchpadPage() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) redirect("/");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const [tokensRes, poolRes] = await Promise.all([
    admin
      .from("launchpad_tokens")
      .select(
        "id, name, ticker, category, status, is_tradeable, is_scheduled, scheduled_at, " +
        "mint_address, pool_address, creator_wallet, supply, vanity_job_id, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("vanity_keypair_pool")
      .select("id", { count: "exact", head: true })
      .is("assigned_token_id", null),
  ]);

  if (tokensRes.error) {
    console.error("[admin] launchpad page error:", tokensRes.error);
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Launchpad Tokens</h1>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load tokens: {tokensRes.error.message}
        </div>
      </div>
    );
  }

  const rows          = tokensRes.data ?? [];
  const poolAvailable = poolRes.count  ?? 0;
  const pending       = rows.filter((t: { status: string }) => t.status === "pending").length;
  const poolLow       = poolAvailable < POOL_WARN_THRESHOLD;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Launchpad Tokens</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {rows.length} tokens · {pending} pending
        </p>
      </div>

      {/* Pool status banner */}
      <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
        poolLow
          ? "border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-950/20"
          : "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/20"
      }`}>
        <div>
          <p className={`text-sm font-semibold ${poolLow ? "text-orange-700 dark:text-orange-300" : "text-emerald-700 dark:text-emerald-300"}`}>
            {poolLow ? "⚠ Vanity pool running low" : "✓ Vanity pool healthy"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {poolAvailable} keypairs available
            {poolLow && " — run the generator script to refill"}
          </p>
        </div>
        {poolLow && (
          <code className="rounded-lg bg-muted px-3 py-1.5 text-xs font-mono text-foreground whitespace-nowrap">
            node scripts/generate-vanity-pool.mjs --count 100
          </code>
        )}
      </div>

      <AdminLaunchpadClient tokens={rows} />
    </div>
  );
}

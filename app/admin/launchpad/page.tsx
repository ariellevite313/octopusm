import type { Metadata } from "next";
import { requireAdmin } from "@/services/admin-service";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { AdminLaunchpadClient } from "@/components/admin/admin-launchpad-client";

export const metadata: Metadata = { title: "Launchpad — Admin" };
export const revalidate = 0;

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}k`;
  if (n === 0)            return "—";
  return `$${n.toFixed(0)}`;
}

export default async function AdminLaunchpadPage() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) redirect("/");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data, error } = await admin
    .from("launchpad_tokens")
    .select(
      "id, name, ticker, category, status, is_verified, is_tradeable, is_scheduled, scheduled_at, " +
      "mint_address, pool_address, creator_wallet, supply, vanity_job_id, created_at, " +
      "price_usd, market_cap_usd, volume_24h_usd, stats_updated_at, is_hidden"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[admin] launchpad page error:", error);
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Launchpad Tokens</h1>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load tokens: {error.message}
        </div>
      </div>
    );
  }

  const rows    = data ?? [];
  const pending = rows.filter((t: { status: string }) => t.status === "pending").length;
  const active  = rows.filter((t: { status: string }) => t.status === "active").length;
  const graduated = rows.filter((t: { status: string }) => t.status === "graduated").length;

  // Aggregate stats
  const totalMcap   = rows.reduce((s: number, t: { market_cap_usd: number | null }) => s + (t.market_cap_usd ?? 0), 0);
  const totalVol24h = rows.reduce((s: number, t: { volume_24h_usd: number | null }) => s + (t.volume_24h_usd ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Launchpad Tokens</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {rows.length} tokens · {pending} pending · {active} active · {graduated} graduated
        </p>
      </div>

      {/* Stats KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total tokens",    value: rows.length.toString() },
          { label: "Active",          value: active.toString() },
          { label: "Total mkt cap",   value: fmtUsd(totalMcap) },
          { label: "Volume 24h",      value: fmtUsd(totalVol24h) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-2xl border border-border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-lg font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <AdminLaunchpadClient tokens={rows} />
    </div>
  );
}

import type { Metadata } from "next";
import { requireAdmin } from "@/services/admin-service";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { AdminLaunchpadClient } from "@/components/admin/admin-launchpad-client";

export const metadata: Metadata = { title: "Launchpad — Admin" };
export const revalidate = 0;

export default async function AdminLaunchpadPage() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) redirect("/");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data, error } = await admin
    .from("launchpad_tokens")
    .select(
      "id, name, ticker, category, status, is_tradeable, is_scheduled, scheduled_at, " +
      "mint_address, pool_address, creator_wallet, supply, vanity_job_id, created_at"
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Launchpad Tokens</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {rows.length} tokens · {pending} pending
        </p>
      </div>
      <AdminLaunchpadClient tokens={rows} />
    </div>
  );
}

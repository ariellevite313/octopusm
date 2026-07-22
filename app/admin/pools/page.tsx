import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import type { MutuelMarketRow } from "@/lib/supabase/types";
import { AdminPoolsClient } from "@/components/admin/admin-pools-client";

export const metadata: Metadata = { title: "Pools -- Admin" };
export const revalidate = 0;

export default async function AdminPoolsPage() {
  // Auth handled by app/admin/layout.tsx (requireAdmin)
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("mutuel_markets")
    .select("*")
    .order("created_at", { ascending: false });

  const pools: MutuelMarketRow[] = (data ?? []).map((m: MutuelMarketRow) => ({
    ...m,
    options: typeof m.options === "string" ? JSON.parse(m.options) : m.options,
  }));

  const pendingCount = pools.filter((p) => p.status === "pending").length;
  const activeCount  = pools.filter((p) => p.status === "active").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Bookmaker Pools</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {pools.length} total
          {pendingCount > 0 && ` · ${pendingCount} pending approval`}
          {activeCount > 0 && ` · ${activeCount} active`}
        </p>
      </div>
      <AdminPoolsClient pools={pools} />
    </div>
  );
}

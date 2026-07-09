import type { Metadata } from "next";
import { getAllMarkets } from "@/services/admin-service";
import { AdminMarketsClient } from "@/components/admin/admin-markets-client";

export const metadata: Metadata = { title: "Markets — Admin" };
export const revalidate = 0;

export default async function AdminMarketsPage() {
  const markets = await getAllMarkets();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Prediction Markets</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {markets.length} total · {markets.filter((m) => !m.is_resolved && m.is_active).length} active · {markets.filter((m) => m.is_resolved).length} resolved
        </p>
      </div>
      <AdminMarketsClient markets={markets} />
    </div>
  );
}

import type { Metadata } from "next";
import { getPendingBets } from "@/services/admin-service";
import { AdminBetsClient } from "@/components/admin/admin-bets-client";

export const metadata: Metadata = { title: "Bet Validation — Admin" };
export const revalidate = 0;

export default async function AdminBetsPage() {
  const bets = await getPendingBets();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bet Validation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {bets.length} bet{bets.length !== 1 ? "s" : ""} pending review
        </p>
      </div>
      <AdminBetsClient bets={bets} />
    </div>
  );
}

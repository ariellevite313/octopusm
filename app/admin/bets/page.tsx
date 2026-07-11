import type { Metadata } from "next";
import { getPendingPredictionPayments, getPendingPoolPayments } from "@/services/admin-service";
import { AdminBetsClient } from "@/components/admin/admin-bets-client";

export const metadata: Metadata = { title: "Predictions Validation -- Admin" };
export const revalidate = 0;

export default async function AdminBetsPage() {
  const [predictionPayments, poolPayments] = await Promise.all([
    getPendingPredictionPayments(),
    getPendingPoolPayments(),
  ]);

  const total = predictionPayments.length + poolPayments.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Predictions Validation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total} prediction{total !== 1 ? "s" : ""} pending review
        </p>
      </div>
      <AdminBetsClient
        predictionPayments={predictionPayments}
        poolPayments={poolPayments}
      />
    </div>
  );
}

import type { Metadata } from "next";
import { getPendingPredictionPayments, getPendingPoolPayments, getPendingUpdownBets } from "@/services/admin-service";
import { AdminBetsClient } from "@/components/admin/admin-bets-client";

export const metadata: Metadata = { title: "Predictions Validation -- Admin" };
export const revalidate = 0;

export default async function AdminBetsPage() {
  const [predictionPayments, poolPayments, updownBets] = await Promise.all([
    getPendingPredictionPayments(),
    getPendingPoolPayments(),
    getPendingUpdownBets(),
  ]);

  const total = predictionPayments.length + poolPayments.length + updownBets.length;

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
        updownBets={updownBets}
      />
    </div>
  );
}

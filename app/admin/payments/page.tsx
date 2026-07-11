import type { Metadata } from "next";
import { getAllPayments, getPendingPaymentsCount } from "@/services/admin-service";
import { AdminPaymentsClient } from "@/components/admin/admin-payments-client";

export const metadata: Metadata = { title: "Payments -- Admin" };
export const revalidate = 0;

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; flow?: string }>;
}) {
  const { status, flow } = await searchParams;
  const filter =
    status === "approved" || status === "rejected" || status === "pending" ? status : undefined;
  // Only claim/launch/listing — prediction bets are in /admin/bets
  const flowFilter =
    flow === "claim" || flow === "launch" || flow === "listing" ? flow : undefined;

  const [payments, pendingCount] = await Promise.all([
    getAllPayments(filter, flowFilter),
    getPendingPaymentsCount(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Payments</h1>
          {pendingCount > 0 && (
            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">
              {pendingCount} pending
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {payments.length} payment{payments.length !== 1 ? "s" : ""}
        </p>
      </div>
      <AdminPaymentsClient
        payments={payments}
        currentFilter={filter}
        currentFlow={flowFilter}
        pendingCount={pendingCount}
      />
    </div>
  );
}

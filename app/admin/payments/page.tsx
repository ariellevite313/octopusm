import type { Metadata } from "next";
import { getAllPayments } from "@/services/admin-service";
import { AdminPaymentsClient } from "@/components/admin/admin-payments-client";

export const metadata: Metadata = { title: "Payments — Admin" };
export const revalidate = 0;

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter =
    status === "approved" || status === "rejected" || status === "pending" ? status : undefined;

  const payments = await getAllPayments(filter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Payments</h1>
        <p className="text-sm text-muted-foreground mt-1">{payments.length} payment{payments.length !== 1 ? 's' : ''}</p>
      </div>
      <AdminPaymentsClient payments={payments} currentFilter={filter} />
    </div>
  );
}

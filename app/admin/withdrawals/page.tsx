import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import type { WithdrawalRow } from "@/lib/supabase/types";
import { AdminWithdrawalsClient } from "@/components/admin/admin-withdrawals-client";

export const metadata: Metadata = { title: "Withdrawals — Admin" };
export const revalidate = 0;

export default async function AdminWithdrawalsPage() {
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("withdrawal_requests")
    .select("*")
    .order("created_at", { ascending: false });

  const withdrawals: WithdrawalRow[] = data ?? [];
  const pendingCount = withdrawals.filter((w) => w.status === "pending").length;
  const approvedCount = withdrawals.filter((w) => w.status === "approved").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Withdrawal Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {withdrawals.length} total
          {pendingCount > 0 && ` · ${pendingCount} pending`}
          {approvedCount > 0 && ` · ${approvedCount} approved (awaiting payment)`}
        </p>
      </div>
      <AdminWithdrawalsClient withdrawals={withdrawals} />
    </div>
  );
}

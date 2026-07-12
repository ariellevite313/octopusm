import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getDashboardData } from "@/services/dashboard-service";
import { TasksSection } from "@/components/dashboard/tasks-section";
import { getWalletAddress } from "@/lib/auth/get-wallet";

export const metadata: Metadata = {
  title: "My Tasks",
  robots: { index: false, follow: false },
};
export const revalidate = 0;

export default async function TasksPage() {
  const wallet = await getWalletAddress();
  if (!wallet) redirect("/");

  const data = await getDashboardData(wallet);

  return (
    <div>
      <TasksSection tasks={data.tasks} walletAddress={wallet} />
    </div>
  );
}

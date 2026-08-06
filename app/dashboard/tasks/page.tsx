import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { TasksSection } from "@/components/dashboard/tasks-section";
import { getTasksWithCompletion } from "@/services/task-service";
import { getWalletAddress } from "@/lib/auth/get-wallet";

export const metadata: Metadata = {
  title: "My Tasks",
  robots: { index: false, follow: false },
};
export const revalidate = 0;

async function TasksLoader({ wallet }: { wallet: string }) {
  const tasks = await getTasksWithCompletion(wallet);
  return <TasksSection tasks={tasks} />;
}

function TasksSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="size-5 rounded-full bg-muted/40 animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-48 rounded bg-muted/40 animate-pulse" />
            <div className="h-2.5 w-32 rounded bg-muted/30 animate-pulse" />
          </div>
          <div className="h-6 w-16 rounded-xl bg-muted/40 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export default async function TasksPage() {
  const wallet = await getWalletAddress();
  if (!wallet) redirect("/");

  return (
    <div>
      <h2 className="mb-3 text-base font-bold text-foreground">Tasks</h2>
      <Suspense fallback={<TasksSkeleton />}>
        <TasksLoader wallet={wallet} />
      </Suspense>
    </div>
  );
}

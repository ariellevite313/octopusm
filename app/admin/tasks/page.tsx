import type { Metadata } from "next";
import { getAllTasks } from "@/services/admin-service";
import { AdminTasksClient } from "@/components/admin/admin-tasks-client";

export const metadata: Metadata = { title: "Tasks — Admin" };
export const revalidate = 0;

export default async function AdminTasksPage() {
  const tasks = await getAllTasks();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">User Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''} · {tasks.filter((t) => t.is_active).length} active
        </p>
      </div>
      <AdminTasksClient tasks={tasks} />
    </div>
  );
}

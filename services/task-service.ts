import { createClient } from "@/lib/supabase/client";
import type { TaskWithCompletion } from "@/lib/supabase/types";

export async function getTasksWithCompletion(walletAddress: string): Promise<TaskWithCompletion[]> {
  const supabase = createClient();

  const [tasksRes, completionsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("user_task_completions")
      .select("task_id, completed_at")
      .eq("wallet_address", walletAddress),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = (tasksRes.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completions = (completionsRes.data ?? []) as any[];
  const completionMap = new Map<string, string>(
    completions.map((c: any) => [c.task_id as string, c.completed_at as string])
  );

  return tasks.map((task: any) => ({
    ...task,
    completed: completionMap.has(task.id),
    completed_at: completionMap.get(task.id) ?? null,
  })) as TaskWithCompletion[];
}

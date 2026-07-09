"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import Image from "next/image";
import type { TaskWithCompletion } from "@/lib/supabase/types";

async function claimTaskClient(taskId: string, walletAddress: string): Promise<{ error?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const res = await fetch(`${supabaseUrl}/functions/v1/complete-task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id: taskId, wallet_address: walletAddress }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    return { error: body.error ?? "Failed to claim task" };
  }
  return {};
}

export function TasksSection({
  tasks,
  walletAddress,
}: {
  tasks: TaskWithCompletion[];
  walletAddress: string;
}) {
  const [claiming, setClaiming] = useState<string | null>(null);
  const [localDone, setLocalDone] = useState<Set<string>>(new Set());

  const isDone = (t: TaskWithCompletion) => t.completed || localDone.has(t.id);

  async function handleClaim(task: TaskWithCompletion) {
    if (isDone(task) || claiming) return;
    setClaiming(task.id);
    const { error } = await claimTaskClient(task.id, walletAddress);
    setClaiming(null);
    if (error) {
      toast.error(error);
      return;
    }
    setLocalDone((prev) => new Set(prev).add(task.id));
    toast.success(`+${task.reward_octo} OCTO earned!`);
  }

  const active     = tasks.filter((t) => !isDone(t));
  const completed  = tasks.filter((t) => isDone(t));

  return (
    <section>
      <h2 className="mb-3 text-base font-bold text-foreground">Tasks</h2>
      <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
        {active.map((task) => (
          <div key={task.id} className="flex items-center gap-3 px-4 py-3.5">
            <Circle className="size-5 shrink-0 text-muted-foreground/40" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
              {task.description && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{task.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 rounded-full bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 border border-orange-200 dark:border-orange-800/40">
                <Image src="/octo-coin.png" alt="OCTO" width={12} height={12} className="rounded-full" />
                <span className="text-xs font-semibold text-orange-700 dark:text-orange-300">
                  +{task.reward_octo}
                </span>
              </div>
              {task.external_link && (
                <a
                  href={task.external_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Open link"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}
              <button
                type="button"
                disabled={!!claiming}
                onClick={() => void handleClaim(task)}
                className="rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-400 disabled:opacity-50 transition-colors"
              >
                {claiming === task.id ? "Claiming..." : "Claim"}
              </button>
            </div>
          </div>
        ))}

        {completed.map((task) => (
          <div key={task.id} className="flex items-center gap-3 px-4 py-3 opacity-60">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground line-through truncate">{task.title}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Image src="/octo-coin.png" alt="OCTO" width={12} height={12} className="rounded-full" />
              <span className="text-xs text-muted-foreground">+{task.reward_octo}</span>
            </div>
          </div>
        ))}

        {tasks.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No tasks available at the moment.
          </div>
        )}
      </div>
    </section>
  );
}

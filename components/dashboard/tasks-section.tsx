"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import type { TaskWithCompletion } from "@/lib/supabase/types";

const DOMAIN_LOGOS: Record<string, string> = {
  "x.com":           "/x-logo.png",
  "twitter.com":     "/x-logo.png",
  "t.me":            "/telegram-logo.png",
  "telegram.org":    "/telegram-logo.png",
  "discord.com":     "/discord-logo.png",
  "discord.gg":      "/discord-logo.png",
  "dexscreener.com": "/dexcrenner.png",
  "clawdtrust.com":  "/clawdtrust-coin.png",
};

function getTaskLogo(task: TaskWithCompletion): string | null {
  if (task.icon) return task.icon;
  if (!task.external_link) return null;
  try {
    const host = new URL(task.external_link).hostname.replace("www.", "");
    return DOMAIN_LOGOS[host] ?? null;
  } catch {
    return null;
  }
}

async function claimTaskClient(taskId: string): Promise<{ error?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { error: "Not authenticated" };

  const res = await fetch(`${supabaseUrl}/functions/v1/complete-task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ task_id: taskId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    return { error: body.error ?? "Failed to claim task" };
  }
  return {};
}

export function TasksSection({ tasks }: { tasks: TaskWithCompletion[] }) {
  const [claiming, setClaiming]   = useState<Set<string>>(new Set());
  const [localDone, setLocalDone] = useState<Set<string>>(new Set());
  const [visited, setVisited]     = useState<Set<string>>(new Set());

  const isDone      = (t: TaskWithCompletion) => t.completed || localDone.has(t.id);
  const isClaiming  = (id: string) => claiming.has(id);
  const hasVisited  = (id: string) => visited.has(id);

  function handleFollow(task: TaskWithCompletion) {
    window.open(task.external_link!, "_blank", "noopener,noreferrer");
    setVisited((prev) => new Set(prev).add(task.id));
  }

  async function handleClaim(task: TaskWithCompletion) {
    if (isDone(task) || isClaiming(task.id)) return;
    setClaiming((prev) => new Set(prev).add(task.id));
    const { error } = await claimTaskClient(task.id);
    setClaiming((prev) => { const s = new Set(prev); s.delete(task.id); return s; });
    if (error) { toast.error(error); return; }
    setLocalDone((prev) => new Set(prev).add(task.id));
    toast.success(`+${task.reward_octo} OCTO earned!`);
  }

  const active    = tasks.filter((t) => !isDone(t));
  const completed = tasks.filter((t) => isDone(t));

  return (
    <section>
      <h2 className="mb-3 text-base font-bold text-foreground">Tasks</h2>
      <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">

        {active.map((task) => {
          const logo       = getTaskLogo(task);
          const needFollow = !!task.external_link && !hasVisited(task.id);
          const claiming_  = isClaiming(task.id);

          return (
            <div key={task.id} className="flex items-center gap-3 px-4 py-3.5">
              {logo ? (
                <Image src={logo} alt="" width={20} height={20} className="size-5 shrink-0 rounded-md object-contain" unoptimized />
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground/40" />
              )}

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

                {needFollow ? (
                  <button
                    type="button"
                    onClick={() => handleFollow(task)}
                    className="rounded-xl bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 transition-colors dark:bg-zinc-700 dark:hover:bg-zinc-600"
                  >
                    Follow
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={claiming_}
                    onClick={() => void handleClaim(task)}
                    className="rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-400 disabled:opacity-50 transition-colors"
                  >
                    {claiming_ ? "Claiming..." : "Claim"}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {completed.map((task) => {
          const logo = getTaskLogo(task);
          return (
            <div key={task.id} className="flex items-center gap-3 px-4 py-3 opacity-60">
              {logo ? (
                <Image src={logo} alt="" width={20} height={20} className="size-5 shrink-0 rounded-md object-contain grayscale" unoptimized />
              ) : (
                <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground line-through truncate">{task.title}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Image src="/octo-coin.png" alt="OCTO" width={12} height={12} className="rounded-full" />
                <span className="text-xs text-muted-foreground">+{task.reward_octo}</span>
              </div>
            </div>
          );
        })}

        {tasks.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No tasks available at the moment.
          </div>
        )}
      </div>
    </section>
  );
}

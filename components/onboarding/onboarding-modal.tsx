"use client";

import { useEffect, useState } from "react";
import { X, Zap, Circle, CheckCircle2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getTasksWithCompletion } from "@/services/task-service";
import type { TaskWithCompletion } from "@/lib/supabase/types";

// ─── Logo helpers (same logic as tasks-section) ───────────────────────────────

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

// ─── Claim helper ─────────────────────────────────────────────────────────────

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

// ─── localStorage helpers ─────────────────────────────────────────────────────

function seenKey(wallet: string)  { return `onboarding_seen_${wallet}`; }
function hasSeen(wallet: string)  { try { return localStorage.getItem(seenKey(wallet)) === "1"; } catch { return false; } }
function markSeen(wallet: string) { try { localStorage.setItem(seenKey(wallet), "1"); } catch { /* ignore */ } }

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOnboardingModal(walletAddress: string | null) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!walletAddress) { setShow(false); return; }
    const t = window.setTimeout(() => {
      if (!hasSeen(walletAddress)) setShow(true);
    }, 800);
    return () => window.clearTimeout(t);
  }, [walletAddress]);

  function close() {
    if (walletAddress) markSeen(walletAddress);
    setShow(false);
  }

  return { show, close };
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = { walletAddress: string; onClose: () => void };

export function OnboardingModal({ walletAddress, onClose }: Props) {
  const queryClient = useQueryClient();
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", walletAddress],
    queryFn:  () => getTasksWithCompletion(walletAddress),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [visited,   setVisited]   = useState<Set<string>>(new Set());
  const [claiming,  setClaiming]  = useState<Set<string>>(new Set());
  const [localDone, setLocalDone] = useState<Set<string>>(new Set());

  const isDone     = (t: TaskWithCompletion) => t.completed || localDone.has(t.id);
  const hasVisited = (id: string) => visited.has(id);
  const isClaiming = (id: string) => claiming.has(id);

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
    void queryClient.invalidateQueries({ queryKey: ["tasks", walletAddress] });
  }

  const totalOcto = tasks.reduce((sum, t) => sum + t.reward_octo, 0);

  function handleClose() {
    markSeen(walletAddress);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-sm rounded-t-3xl border border-orange-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-900 sm:rounded-3xl">

        {/* Header */}
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-500/15">
              <Zap className="size-5 text-orange-500" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-orange-500">OMdotfun</p>
              <h2 className="text-lg font-semibold leading-tight text-zinc-900 dark:text-white">Getting started</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10"
          >
            <X className="size-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          Complete these tasks and earn up to{" "}
          <span className="inline-flex items-center gap-1 font-semibold text-orange-500">
            +{totalOcto} <img src="/octo-coin.png" alt="OCTO" className="size-4 object-contain" />
          </span>!
        </p>

        {/* Task list */}
        <div className="space-y-2">
          {tasks.map((task) => {
            const logo       = getTaskLogo(task);
            const done       = isDone(task);
            const needFollow = !!task.external_link && !hasVisited(task.id) && !done;
            const claiming_  = isClaiming(task.id);

            return (
              <div
                key={task.id}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
                  done
                    ? "border-emerald-100 bg-emerald-50/60 opacity-60 dark:border-emerald-500/20 dark:bg-emerald-500/5"
                    : "border-orange-100 bg-orange-50/60 dark:border-white/10 dark:bg-white/5"
                }`}
              >
                {/* Logo */}
                {logo ? (
                  <img
                    src={logo}
                    alt=""
                    className={`size-9 shrink-0 rounded-xl object-contain ${done ? "grayscale" : ""}`}
                  />
                ) : done ? (
                  <CheckCircle2 className="size-9 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="size-9 shrink-0 text-zinc-300 dark:text-zinc-600" />
                )}

                {/* Title */}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${done ? "text-zinc-400 line-through" : "text-zinc-900 dark:text-white"}`}>
                    {task.title}
                  </p>
                </div>

                {/* Reward + button */}
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`inline-flex items-center gap-1 text-xs font-bold ${done ? "text-emerald-600 dark:text-emerald-400" : "text-orange-500"}`}>
                    +{task.reward_octo} <img src="/octo-coin.png" alt="OCTO" className="size-3.5 object-contain" />
                  </span>

                  {!done && (
                    needFollow ? (
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
                        {claiming_ ? "…" : "Claim"}
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="mt-4 w-full rounded-2xl bg-orange-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
        >
          {"Let's Go"}
        </button>
        <p className="mt-3 text-center text-xs text-zinc-400 dark:text-zinc-500">
          You can find these tasks anytime in your dashboard.
        </p>
      </div>
    </div>
  );
}

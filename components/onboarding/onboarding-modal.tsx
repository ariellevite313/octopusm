"use client";

import { useEffect, useState } from "react";
import { X, Check, ArrowUpRight, Loader2, Gift } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getTasksWithCompletion } from "@/services/task-service";
import type { TaskWithCompletion } from "@/lib/supabase/types";
import { useT } from "@/lib/i18n";
import { LOCALES } from "@/lib/i18n-mark";

// ─── Logo helpers (same logic as tasks-section) ───────────────────────────────

const DOMAIN_LOGOS: Record<string, string> = {
  "x.com":           "/x-logo.png",
  "twitter.com":     "/x-logo.png",
  "t.me":            "/telegram-logo.png",
  "telegram.org":    "/telegram-logo.png",
  "discord.com":     "/discord.png",
  "discord.gg":      "/discord.png",
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
  const { tr, lang } = useT();
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
    if (error) { toast.error(tr(error)); return; }
    setLocalDone((prev) => new Set(prev).add(task.id));
    toast.success(tr("+{amount} OMERO earned!", { amount: task.reward_octo }));
    void queryClient.invalidateQueries({ queryKey: ["tasks", walletAddress] });
  }

  const totalOcto = tasks.reduce((sum, t) => sum + t.reward_octo, 0);
  const earned    = tasks.filter(isDone).reduce((sum, t) => sum + t.reward_octo, 0);
  const doneCount = tasks.filter(isDone).length;
  const pct       = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  function handleClose() {
    markSeen(walletAddress);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-md sm:items-center sm:px-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="relative max-h-[100dvh] w-full overflow-y-auto rounded-t-[32px] bg-background shadow-2xl ring-1 ring-border sm:max-w-[420px] sm:rounded-[32px]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,rgba(255,122,26,0.30),transparent_70%)]" />

        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 z-10 flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          aria-label={tr("Close")}
        >
          <X className="size-5" />
        </button>

        <div className="relative px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-8">
          {/* Pièce OMERO */}
          <div className="flex flex-col items-center text-center">
            <div className="relative size-24 rounded-full p-[3px]">
              <span className="absolute inset-0 overflow-hidden rounded-full"><span className="gains-frame absolute inset-[-40%]" /></span>
              <span className="relative flex size-full items-center justify-center overflow-hidden rounded-full border-[3px] border-background bg-muted">
                <img src="/octo-coin.png" alt="OMERO" className="size-full object-cover" />
              </span>
            </div>

            <p className="mt-5 text-[13px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tr("Welcome bonus")}</p>
            <h2 className="num mt-1 text-[40px] font-bold leading-none tracking-tight text-foreground">
              +{totalOcto.toLocaleString(LOCALES[lang])} <span className="text-primary">OMERO</span>
            </h2>
            <p className="mt-2 text-[15px] text-muted-foreground">{tr("Complete a few quick tasks to collect them.")}</p>
          </div>

          {/* Progression */}
          <div className="mt-6">
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="font-semibold text-foreground">{tr("{done} / {total} done", { done: doneCount, total: tasks.length })}</span>
              <span className="num text-muted-foreground">{earned.toLocaleString(LOCALES[lang])} / {totalOcto.toLocaleString(LOCALES[lang])} OMERO</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Tâches */}
          <div className="mt-4">
            {tasks.map((task) => {
              const logo       = getTaskLogo(task);
              const done       = isDone(task);
              const needFollow = !!task.external_link && !hasVisited(task.id) && !done;
              const claiming_  = isClaiming(task.id);

              return (
                <div key={task.id} className="flex items-center gap-3.5 border-b border-border py-3.5 last:border-b-0">
                  {logo ? (
                    <img src={logo} alt="" className={`size-9 shrink-0 rounded-full object-contain ${logo === "/x-logo.png" ? "dark:invert" : ""}`} />
                  ) : (
                    <Gift className={`size-9 shrink-0 p-1.5 ${done ? "text-muted-foreground/50" : "text-primary"}`} />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[15px] font-semibold ${done ? "text-muted-foreground" : "text-foreground"}`}>{task.title}</p>
                    <p className="num flex items-center gap-1 text-[13px] font-semibold text-muted-foreground">
                      +{task.reward_octo.toLocaleString(LOCALES[lang])}
                      <img src="/octo-coin.png" alt="" className="size-3.5 rounded-full object-cover" />
                    </p>
                  </div>

                  {done ? (
                    <span className="flex items-center gap-1 text-[13px] font-semibold text-up">
                      <Check className="size-4" strokeWidth={3} />{tr("Done")}
                    </span>
                  ) : needFollow ? (
                    <button
                      type="button"
                      onClick={() => handleFollow(task)}
                      className="flex items-center gap-1 rounded-full px-4 py-2 text-[13px] font-bold text-foreground ring-1 ring-border transition-colors hover:bg-muted"
                    >
                      {tr("Go")}<ArrowUpRight className="size-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={claiming_}
                      onClick={() => void handleClaim(task)}
                      className="flex min-w-[72px] items-center justify-center rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-white transition-all hover:brightness-105 disabled:opacity-60"
                    >
                      {claiming_ ? <Loader2 className="size-4 animate-spin" /> : tr("Claim")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="mt-5 flex h-14 w-full items-center justify-center rounded-full bg-primary text-[16px] font-bold text-white shadow-[0_10px_30px_-10px_rgba(255,122,26,0.8)] transition-all hover:brightness-105"
          >
            {doneCount === tasks.length && tasks.length > 0 ? tr("All done — let's go") : tr("Let's go")}
          </button>
          <p className="mt-3 text-center text-[13px] text-muted-foreground">{tr("You can find these tasks anytime in your dashboard.")}</p>
        </div>
      </div>
    </div>
  );
}

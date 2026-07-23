"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getTasksWithCompletion } from "@/services/task-service";

const SOCIAL_LOGOS: Record<string, string> = {
  Discord:  "/discord-logo.png",
  Telegram: "/telegram-logo.png",
};

function XLogoSvg({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-label="X" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function seenKey(wallet: string) { return `onboarding_seen_${wallet}`; }

function hasSeen(wallet: string) {
  try { return localStorage.getItem(seenKey(wallet)) === "1"; } catch { return false; }
}

function markSeen(wallet: string) {
  try { localStorage.setItem(seenKey(wallet), "1"); } catch { /* ignore */ }
}

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
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", walletAddress],
    queryFn: () => getTasksWithCompletion(walletAddress),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

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

        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
                task.completed
                  ? "border-emerald-100 bg-emerald-50/60 opacity-60 dark:border-emerald-500/20 dark:bg-emerald-500/5"
                  : "border-orange-100 bg-orange-50/60 dark:border-white/10 dark:bg-white/5"
              }`}
            >
              {task.icon === "X" ? (
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
                  <XLogoSvg className="size-5 text-zinc-900 dark:text-white" />
                </div>
              ) : task.icon && SOCIAL_LOGOS[task.icon] ? (
                <img
                  src={SOCIAL_LOGOS[task.icon]}
                  alt={task.icon}
                  className="size-9 shrink-0 rounded-xl object-contain"
                />
              ) : (
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-bold text-orange-600 shadow-sm dark:bg-white/10 dark:text-orange-400">
                  🎯
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${task.completed ? "text-zinc-400 line-through" : "text-zinc-900 dark:text-white"}`}>
                  {task.title}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`inline-flex items-center gap-1 text-xs font-bold ${task.completed ? "text-emerald-600 dark:text-emerald-400" : "text-orange-500"}`}>
                  +{task.reward_octo} <img src="/octo-coin.png" alt="OCTO" className="size-3.5 object-contain" />
                </span>
                {!task.completed && task.external_link && (
                  <a href={task.external_link} target="_blank" rel="noopener noreferrer" className="rounded-lg p-1 text-zinc-400 hover:text-orange-500">
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
            </div>
          ))}
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

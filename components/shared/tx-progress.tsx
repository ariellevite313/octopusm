"use client";

/**
 * Suivi animé d'une opération (tip, retrait) : roue qui tourne, étapes qui se cochent une à une,
 * puis coche et contour de la couleur du texte (blanc en sombre, noir en clair), et bouton qui devient vert.
 */
import { useEffect, useState } from "react";

export type TxPhase = "running" | "success";

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin ${className}`} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".18" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Check({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="11" fill="var(--foreground)" />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="var(--background)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="tx-check-path" />
    </svg>
  );
}

/** Fait avancer les étapes d'elles-mêmes pendant que l'opération tourne ; toutes cochées au succès. */
export function useTxSteps(phase: TxPhase | null, count: number, every = 520) {
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (phase === null) { setDone(0); return; }
    if (phase === "success") {
      // Les étapes restantes se cochent vite, une par une
      const id = setInterval(() => setDone((d) => (d >= count ? d : d + 1)), 140);
      return () => clearInterval(id);
    }
    const id = setInterval(() => setDone((d) => Math.min(count - 1, d + 1)), every);
    return () => clearInterval(id);
  }, [phase, count, every]);
  return done;
}

export function TxProgress({ phase, title, subtitle, steps, done, rows }: {
  phase: TxPhase;
  title: string;
  subtitle?: string;
  steps: string[];
  done: number;
  rows?: { label: string; value: React.ReactNode }[];
}) {
  const ok = phase === "success" && done >= steps.length;
  return (
    <div className="tx-in">
      <div className={`rounded-[24px] border bg-muted/30 px-5 pb-5 pt-6 transition-[border-color,box-shadow] duration-500 ${ok ? "tx-glow border-foreground/40" : "border-border"}`}>
        <div className="flex flex-col items-center text-center">
          <span className="flex size-11 items-center justify-center">
            {ok ? <Check className="tx-pop size-10" /> : <Spinner className="size-8 text-foreground" />}
          </span>
          <p key={ok ? "ok" : "run"} className="tx-fade mt-3 text-[17px] font-bold">{title}</p>
          {subtitle && !ok && <p className="mt-1 max-w-[260px] text-[12.5px] leading-snug text-muted-foreground">{subtitle}</p>}
        </div>
        <ul className="mt-5 space-y-2.5">
          {steps.map((s, i) => {
            const state = i < done ? "done" : i === done && !ok ? "active" : "todo";
            return (
              <li key={s} className={`flex items-center gap-2.5 text-[13.5px] transition-colors duration-300 ${state === "todo" ? "text-muted-foreground/50" : state === "active" ? "text-foreground" : "text-muted-foreground"}`}>
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {state === "done" ? <span className="tx-pop size-2.5 rounded-full bg-foreground shadow-[0_0_10px_color-mix(in_srgb,var(--foreground)_60%,transparent)]" />
                    : state === "active" ? <Spinner className="size-3.5" />
                    : <span className="size-2 rounded-full border border-current" />}
                </span>
                {s}
              </li>
            );
          })}
        </ul>
      </div>
      {rows && rows.length > 0 && (
        <div className="mt-4 space-y-2 px-1">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-[13.5px]">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="num font-semibold">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bouton d'action : verre glacé transparent et incolore pendant l'opération et au succès (roue, puis coche). */
export function TxButton({ phase, running, success, onClick, disabled, children, type = "button" }: {
  phase: TxPhase | null;
  running: string;
  success: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  type?: "button" | "submit";
}) {
  const ok = phase === "success";
  return (
    <button type={type} onClick={onClick} disabled={disabled || phase === "running"}
      className={`relative flex h-[52px] w-full items-center justify-center gap-2 overflow-hidden rounded-full text-base font-extrabold transition-[background-color,color,box-shadow] duration-500 disabled:cursor-default ${
        phase === null ? "bg-foreground text-background disabled:opacity-40" : "tx-glass text-foreground"}`}>
      {phase === "running" && <><Spinner className="size-4" /><span className="tx-fade">{running}</span></>}
      {ok && <><span className="tx-fade">{success}</span><Check className="tx-pop size-5 [&_circle]:fill-[var(--foreground)] [&_path]:stroke-[var(--background)]" /></>}
      {phase === null && children}
    </button>
  );
}

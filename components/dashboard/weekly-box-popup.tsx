"use client";

/**
 * Fenetre de la box de la semaine, a l'ouverture de l'app : la recompense de la semaine passee selon le rang
 * (box SOL pour le numero 1, OMERO pour le top 10). On peut la reclamer tout de suite ou passer.
 * Elle ne s'affiche qu'une fois par semaine et par personne (le choix « passer » est garde sur l'appareil).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { GiftSvg } from "@/components/dashboard/weekly-box";

type Last = {
  week: string;
  mine: { rank: number; points: number; omero: number } | null;
  box: { prizeSol: number; status: "won" | "claimed" | "paid" | "none"; paidTx: string | null } | null;
};
const AGE_KEY = "om_age_ok_v1";
const seenKey = (w: string, wallet: string) => `om_wbox_popup_${w}_${wallet}`;
const read = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const save = (k: string) => { try { localStorage.setItem(k, "1"); } catch { /* stockage indisponible */ } };

export function WeeklyBoxPopup() {
  const { tr } = useT();
  const { walletAddress, isAuthenticated } = useAuth();
  const [last, setLast] = useState<Last | null>(null);
  const [stage, setStage] = useState<"closed" | "opening" | "open">("closed");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !walletAddress) return;
    let live = true;
    const t = setTimeout(async () => {
      if (!read(AGE_KEY)) return; // pas par-dessus l'avis d'age
      try {
        const r = await fetch("/api/weekly-box", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        const l = j.last as Last | null;
        if (!live || !l || (!l.mine && !(l.box && l.box.status !== "none"))) return;
        if (read(seenKey(l.week, walletAddress))) return;
        setStatus(l.box?.status ?? null);
        setLast(l);
      } catch { /* silencieux : la page de la box reste disponible */ }
    }, 2500);
    return () => { live = false; clearTimeout(t); };
  }, [isAuthenticated, walletAddress]);

  if (!last || !walletAddress || typeof document === "undefined") return null;
  const wk = last.week;
  const close = () => { save(seenKey(wk, walletAddress)); setLast(null); };
  const hasSol = !!last.box && last.box.status !== "none";
  const sol = last.box?.prizeSol ?? 0, omero = last.mine?.omero ?? 0;

  function open() { setStage("opening"); setTimeout(() => setStage("open"), 1100); }
  async function claim() {
    setBusy(true);
    try {
      const r = await fetch("/api/weekly-box/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ week: wk }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not claim right now");
      setStatus("claimed");
      toast.success(tr("Claimed. We will send your SOL soon."));
    } catch (e) { toast.error(tr((e as Error).message)); }
    setBusy(false);
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-black/70 p-5 backdrop-blur-sm" role="dialog" aria-modal="true">
      <style>{`@keyframes wbshake{0%,100%{transform:rotate(0)}20%{transform:rotate(-7deg)}40%{transform:rotate(7deg)}60%{transform:rotate(-5deg)}80%{transform:rotate(5deg)}}
@keyframes wblid{to{transform:translate(10px,-60px) rotate(20deg);opacity:0}}`}</style>
      <div className="relative w-full max-w-sm overflow-hidden rounded-[28px] border border-border bg-card p-6 text-center shadow-2xl animate-in zoom-in-95 fade-in duration-300">
        <div className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,140,60,0.35),transparent)]" />
        <p className="relative text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
          {last.mine ? tr("Last week: rank #{n}", { n: last.mine.rank }) : tr("You won last week's box")}
        </p>
        <div className="relative flex h-44 items-center justify-center">
          {stage !== "open" ? <GiftSvg opening={stage === "opening"} /> : (
            <div className="flex flex-col items-center gap-1 animate-in zoom-in-50 fade-in duration-500">
              {hasSol && (
                <div className="flex items-center gap-3 whitespace-nowrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/solana.png" alt="" className="size-10 rounded-full" />
                  <span className="num text-[38px] font-extrabold tracking-tight text-foreground">{sol} SOL</span>
                </div>
              )}
              {omero > 0 && (
                <div className="flex items-center gap-3 whitespace-nowrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/octo-coin.png" alt="" className="size-9 rounded-full" />
                  <span className={`num font-extrabold tracking-tight text-foreground ${hasSol ? "text-[24px]" : "text-[38px]"}`}>{omero.toLocaleString()} OMERO</span>
                </div>
              )}
              {omero > 0 && <span className="text-[13px] font-semibold text-muted-foreground">{tr("{n} OMERO credited", { n: omero.toLocaleString() })}</span>}
            </div>
          )}
        </div>
        <div className="relative space-y-2">
          {stage === "closed" && <button onClick={open} className="h-12 w-full rounded-full bg-foreground text-[16px] font-bold text-background">{tr("Open my box")}</button>}
          {stage === "open" && hasSol && status === "won" && (
            <button onClick={claim} disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[16px] font-bold text-background disabled:opacity-50">
              {busy && <Loader2 className="size-4 animate-spin" />}{tr("Claim")}
            </button>
          )}
          {stage === "open" && hasSol && status === "claimed" && (
            <div className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-muted text-[15px] font-bold text-foreground"><Check className="size-4" />{tr("Payment on the way")}</div>
          )}
          {stage === "open" && (
            <Link href="/dashboard/box" onClick={close} className="flex h-12 w-full items-center justify-center rounded-full bg-muted text-[15px] font-bold text-foreground">{tr("See the weekly box")}</Link>
          )}
        </div>
      </div>
      <button onClick={close} aria-label={tr("Close")} className="flex size-12 items-center justify-center rounded-full border-2 border-white/80 text-white transition-opacity hover:opacity-80"><X className="size-6" /></button>
    </div>,
    document.body,
  );
}

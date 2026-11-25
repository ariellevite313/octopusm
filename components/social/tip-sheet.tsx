"use client";

/** Fenêtre d'envoi d'un tip : OMERO actif, OMUSD (stablecoin de la plateforme) grisé pour l'instant. */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { TIP_DAILY_CAP, TIP_MIN_ACCOUNT_DAYS, type TipErrorCode } from "@/lib/social/tips";
import { BonbonIcon } from "@/components/shared/bonbon-icon";
import { BONBON_ORANGE, BONBON_WHITE, bonbonsValue } from "@/lib/bonbons";
import { TxButton, TxProgress, useTxSteps, type TxPhase } from "@/components/shared/tx-progress";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));


export function TipSheet({ postId, recipientName, onClose, onSent }: {
  postId: string;
  recipientName: string;
  onClose: () => void;
  onSent: (tipTotal: number) => void;
}) {
  const { tr } = useT();
  const [balance, setBalance] = useState<number | null>(null);
  const [white, setWhite] = useState(1);
  const [orange, setOrange] = useState(0);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<TxPhase | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let off = false;
    fetch("/api/balance", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (!off) setBalance(Math.floor(Number(j.octoBalance) || 0)); })
      .catch(() => { if (!off) setBalance(0); });
    return () => { off = true; };
  }, []);

  const value = bonbonsValue(orange, white);
  const max = Math.min(TIP_DAILY_CAP, balance ?? 0);
  const valid = value >= 1 && value <= max;

  const errorText = (code: TipErrorCode | undefined, fallback: string) => {
    switch (code) {
      case "account_too_new": return tr("Tips unlock when your account is at least {n} days old", { n: TIP_MIN_ACCOUNT_DAYS });
      case "no_activity": return tr("Tips unlock after you create an approved market or launch a token");
      case "rate_limited": return tr("Too many tips this hour, try again later");
      case "daily_cap": return tr("You can send up to {n} OMERO per 24 hours", { n: TIP_DAILY_CAP });
      case "insufficient_balance": return tr("Not enough OMERO");
      case "self_tip": return tr("You can't tip your own post");
      case "invalid_amount": return tr("Enter a whole amount between 1 and {n} OMERO", { n: TIP_DAILY_CAP });
      default: return tr(fallback);
    }
  };

  const STEPS = [tr("Checking your balance"), tr("Sending OMERO"), tr("Delivering the bonbons"), tr("Updating the post")];
  const done = useTxSteps(phase, STEPS.length);

  async function send() {
    if (!valid || busy) return;
    setBusy(true);
    setPhase("running");
    const t0 = Date.now();
    try {
      const r = await fetch(`/api/posts/${postId}/tip`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value, currency: "omero" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPhase(null); toast.error(errorText(j.code, j.error ?? "Tip failed, try again")); return; }
      // Laisse les étapes défiler, puis la carte passe au vert
      await wait(Math.max(0, 1700 - (Date.now() - t0)));
      setPhase("success");
      window.dispatchEvent(new CustomEvent("omero-balance-changed"));
      await wait(2300);
      onSent(Number(j.tip_total) || 0);
      onClose();
    } catch {
      setPhase(null);
      toast.error(tr("Tip failed, try again"));
    } finally { setBusy(false); }
  }

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-[2px]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-t-[28px] border-t border-border bg-card px-5 pb-8 pt-2 text-foreground shadow-2xl">
        <button onClick={onClose} aria-label={tr("Close")} className="mx-auto mb-3 flex h-6 w-full items-center justify-center">
          <span className="h-1.5 w-11 rounded-full bg-muted-foreground/30" />
        </button>

        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted"><BonbonIcon kind="orange" className="h-10" /></span>
          <div className="min-w-0">
            <p className="text-lg font-bold">{tr("Send a tip")}</p>
            <p className="truncate text-[13px] text-muted-foreground">{tr("to {name}, for this post", { name: recipientName })}</p>
          </div>
        </div>

        {phase !== null ? (
          <TxProgress
            phase={phase}
            done={done}
            title={phase === "success" && done >= STEPS.length ? tr("Tip sent") : tr("Sending your tip")}
            subtitle={tr("to {name}, for this post", { name: recipientName })}
            steps={STEPS}
            rows={[
              { label: tr("To"), value: recipientName },
              { label: tr("Bonbons"), value: <span className="inline-flex items-center gap-2">{white > 0 && <span className="inline-flex items-center gap-1"><BonbonIcon kind="white" className="h-5" />{white}</span>}{orange > 0 && <span className="inline-flex items-center gap-1"><BonbonIcon kind="orange" className="h-5" />{orange}</span>}</span> },
              { label: tr("Total"), value: `${value.toLocaleString()} OMERO` },
            ]}
          />
        ) : <>
        {/* Monnaie */}
        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <div className="flex items-center gap-2.5 rounded-2xl border-2 border-foreground bg-muted/50 p-3">
            <Image src="/octo-coin.png" alt="" width={34} height={34} className="size-[34px] rounded-full object-cover" unoptimized />
            <span className="min-w-0">
              <span className="block text-[15px] font-bold">OMERO</span>
              <span className="block text-xs text-muted-foreground">{balance === null ? "…" : balance.toLocaleString()}</span>
            </span>
          </div>
          <div aria-disabled="true" className="pointer-events-none flex select-none items-center gap-2.5 rounded-2xl border-2 border-transparent bg-muted/50 p-3 opacity-40 grayscale">
            <Image src="/omusd.png" alt="" width={34} height={34} className="size-[34px] rounded-full" unoptimized />
            <span className="min-w-0">
              <span className="block text-[15px] font-bold">OMUSD</span>
              <span className="block text-xs text-muted-foreground">{tr("Stablecoin")}</span>
            </span>
          </div>
        </div>

        {/* Bonbons : blanc = 10 OMERO, orange = 100 OMERO */}
        <div className="space-y-2.5">
          {([["white", BONBON_WHITE, white, setWhite], ["orange", BONBON_ORANGE, orange, setOrange]] as const).map(([kind, worth, n, set]) => {
            const canAdd = value + worth <= max;
            return (
              <div key={kind} className="flex items-center gap-3 rounded-2xl border-2 border-border bg-muted/40 px-3 py-2.5">
                <BonbonIcon kind={kind} className="h-16" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold">{kind === "white" ? tr("White bonbon") : tr("Orange bonbon")}</span>
                  <span className="block text-xs text-muted-foreground">{worth} OMERO</span>
                </span>
                <button type="button" aria-label={tr("Remove one")} onClick={() => set(Math.max(0, n - 1))} disabled={n === 0}
                  className="flex size-9 items-center justify-center rounded-full border border-border text-lg font-bold disabled:opacity-30">−</button>
                <span className="num w-6 text-center text-xl font-extrabold">{n}</span>
                <button type="button" aria-label={tr("Add one")} onClick={() => set(n + 1)} disabled={!canAdd}
                  className="flex size-9 items-center justify-center rounded-full border border-border text-lg font-bold disabled:opacity-30">+</button>
              </div>
            );
          })}
        </div>

        <p className="my-3 flex items-center justify-between rounded-2xl border-2 border-foreground px-4 py-3">
          <span className="text-sm font-semibold text-muted-foreground">{tr("Total")}</span>
          <span className="num text-2xl font-extrabold">{value.toLocaleString()} <span className="text-sm font-semibold text-muted-foreground">OMERO</span></span>
        </p>

        </>}

        <div className="mt-4">
          <TxButton phase={phase} running={tr("Sending…")} success={tr("Sent")} onClick={send} disabled={!valid || busy}>{tr("Confirm")}</TxButton>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">{tr("Up to {n} OMERO per 24 hours. OMERO are platform points for now.", { n: TIP_DAILY_CAP })}</p>
      </div>
    </div>,
    document.body,
  );
}

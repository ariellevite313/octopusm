"use client";

/** Fenêtre d'envoi d'un tip : OMERO actif, OMUSD (stablecoin de la plateforme) grisé pour l'instant. */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { OmeroHeadIcon } from "@/components/shared/omero-head-icon";
import { TIP_DAILY_CAP, TIP_MIN_ACCOUNT_DAYS, type TipErrorCode } from "@/lib/social/tips";

const QUICK = [10, 50, 100];

export function TipSheet({ postId, recipientName, onClose, onSent }: {
  postId: string;
  recipientName: string;
  onClose: () => void;
  onSent: (tipTotal: number) => void;
}) {
  const { tr } = useT();
  const [balance, setBalance] = useState<number | null>(null);
  const [amount, setAmount] = useState("50");
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let off = false;
    fetch("/api/balance", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (!off) setBalance(Math.floor(Number(j.octoBalance) || 0)); })
      .catch(() => { if (!off) setBalance(0); });
    return () => { off = true; };
  }, []);

  const value = /^\d+$/.test(amount) ? parseInt(amount, 10) : 0;
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

  async function send() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/posts/${postId}/tip`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value, currency: "omero" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(errorText(j.code, j.error ?? "Tip failed, try again")); return; }
      toast.success(tr("{n} OMERO sent to {name}", { n: value.toLocaleString(), name: recipientName }));
      onSent(Number(j.tip_total) || 0);
      window.dispatchEvent(new CustomEvent("omero-balance-changed"));
      onClose();
    } catch {
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
          <span className="flex size-11 items-center justify-center rounded-full bg-muted"><OmeroHeadIcon filled className="size-6" /></span>
          <div className="min-w-0">
            <p className="text-lg font-bold">{tr("Send a tip")}</p>
            <p className="truncate text-[13px] text-muted-foreground">{tr("to {name}, for this post", { name: recipientName })}</p>
          </div>
        </div>

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

        <label className="flex items-center justify-between rounded-2xl border-2 border-foreground px-4 py-3">
          <input
            inputMode="numeric" autoFocus value={amount} aria-label={tr("Amount")}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full bg-transparent text-3xl font-extrabold outline-none"
          />
          <span className="shrink-0 pl-2 text-sm font-semibold text-muted-foreground">OMERO</span>
        </label>

        <div className="my-3 grid grid-cols-4 gap-2">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => setAmount(String(q))}
              className={`rounded-xl border py-2.5 text-[15px] font-bold ${value === q ? "border-foreground" : "border-border"} bg-muted/40`}>{q}</button>
          ))}
          <button type="button" onClick={() => setAmount(String(max))} className={`rounded-xl border py-2.5 text-[15px] font-bold ${value === max && max > 0 ? "border-foreground" : "border-border"} bg-muted/40`}>{tr("Max")}</button>
        </div>

        <button onClick={send} disabled={!valid || busy}
          className="flex h-[52px] w-full items-center justify-center rounded-full bg-foreground text-base font-extrabold text-background disabled:opacity-40">
          {busy ? <Loader2 className="size-5 animate-spin" /> : tr("Confirm")}
        </button>
        <p className="mt-3 text-center text-xs text-muted-foreground">{tr("Up to {n} OMERO per 24 hours. OMERO are platform points for now.", { n: TIP_DAILY_CAP })}</p>
      </div>
    </div>,
    document.body,
  );
}

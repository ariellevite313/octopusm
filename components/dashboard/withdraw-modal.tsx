"use client";

import { useState } from "react";
import Image from "next/image";
import { X, ArrowUpRight, Loader2, CheckCircle, Clock } from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type Token = "usdc" | "clawdtrust";

interface Props {
  token: Token;
  balance: number;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MIN: Record<Token, number> = { usdc: 2, clawdtrust: 500_000 };

function fmtUsdc(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtClt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}
function fmtBalance(token: Token, n: number) {
  return token === "usdc" ? `$${fmtUsdc(n)} USDC` : `${fmtClt(n)} CLT`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WithdrawModal({ token, balance, onClose }: Props) {
  const [rawAmount, setRawAmount] = useState("");
  const [step, setStep] = useState<"idle" | "loading" | "done">("idle");

  const isUsdc   = token === "usdc";
  const logoSrc  = isUsdc ? "/usdc-coin.png" : "/clawdtrust-coin.png";
  const symbol   = isUsdc ? "USDC" : "CLT";
  const accent   = isUsdc ? "orange" : "purple";
  const min      = MIN[token];

  // Parse the raw input — USDC is decimal, CLT is integer
  const parsed   = isUsdc ? parseFloat(rawAmount) : parseInt(rawAmount, 10);
  const valid    = Number.isFinite(parsed) && parsed >= min && parsed <= balance;

  function handleMax() {
    setRawAmount(isUsdc ? balance.toFixed(2) : String(Math.floor(balance)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;

    setStep("loading");
    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, amount: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Withdrawal request failed.");
        setStep("idle");
        return;
      }
      setStep("done");
    } catch {
      toast.error("Network error, please try again.");
      setStep("idle");
    }
  }

  // ── Accent helpers ────────────────────────────────────────────────────────
  const btnClass =
    accent === "orange"
      ? "bg-orange-500 hover:bg-orange-400 disabled:opacity-50"
      : "bg-purple-600 hover:bg-purple-500 disabled:opacity-50";

  const ringClass =
    accent === "orange"
      ? "focus:ring-orange-400/50"
      : "focus:ring-purple-400/50";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">
      <div className="relative w-full max-w-sm rounded-t-2xl border border-border bg-card p-6 shadow-xl sm:rounded-2xl">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors"
        >
          <X className="size-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="size-10 rounded-full overflow-hidden bg-muted shrink-0">
            <Image src={logoSrc} alt={symbol} width={40} height={40} className="size-10 object-cover" unoptimized />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Withdraw {symbol}</h2>
            <p className="text-xs text-muted-foreground">
              Available: <span className="font-medium text-foreground">{fmtBalance(token, balance)}</span>
            </p>
          </div>
        </div>

        {/* Done state */}
        {step === "done" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle className="size-7 text-emerald-500" />
            </div>
            <p className="text-sm font-semibold text-foreground">Request submitted!</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Your withdrawal of{" "}
              <span className="font-medium text-foreground">
                {isUsdc ? `$${fmtUsdc(parsed)} USDC` : `${fmtClt(parsed)} CLT`}
              </span>{" "}
              has been sent to the team for review.
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-500">
              <Clock className="size-3.5" />
              Usually processed within 24–48 hours
            </div>
            <button
              onClick={onClose}
              className="mt-3 w-full rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Amount input */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Amount
                </label>
                <button
                  type="button"
                  onClick={handleMax}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Max
                </button>
              </div>

              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  {isUsdc && <span className="text-sm text-muted-foreground">$</span>}
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  min={min}
                  max={balance}
                  step={isUsdc ? "0.01" : "1"}
                  value={rawAmount}
                  onChange={(e) => setRawAmount(e.target.value)}
                  placeholder={isUsdc ? "0.00" : "0"}
                  className={`w-full rounded-xl border border-border bg-background py-2.5 pr-16 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 ${ringClass} ${isUsdc ? "pl-7" : "pl-3"}`}
                />
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                  <span className="text-xs font-semibold text-muted-foreground">{symbol}</span>
                </div>
              </div>

              {/* Min hint */}
              <p className="text-[10px] text-muted-foreground">
                Minimum:{" "}
                {isUsdc ? `$${fmtUsdc(min)} USDC` : `${fmtClt(min)} CLT`}
              </p>

              {/* Validation feedback */}
              {rawAmount && !Number.isNaN(parsed) && parsed > balance && (
                <p className="text-xs text-destructive">Exceeds your available balance.</p>
              )}
              {rawAmount && !Number.isNaN(parsed) && parsed < min && parsed > 0 && (
                <p className="text-xs text-destructive">
                  Minimum is {isUsdc ? `$${fmtUsdc(min)} USDC` : `${fmtClt(min)} CLT`}.
                </p>
              )}
            </div>

            {/* Info box */}
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 space-y-1">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">How it works:</span> Your request is reviewed by our team. Once approved, {symbol} will be sent to your connected wallet address.
              </p>
              <p className="text-xs text-amber-500 flex items-center gap-1">
                <Clock className="size-3 shrink-0" />
                Processing time: 24–48 hours
              </p>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!valid || step === "loading"}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-colors ${btnClass}`}
            >
              {step === "loading" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <ArrowUpRight className="size-4" />
                  Request withdrawal
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

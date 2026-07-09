"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Plus, Trash2, Loader2, CheckCircle } from "lucide-react";
import { TokenLogo } from "@/components/shared/token-logo";
import { MutuelMarketRow } from "@/lib/supabase/types";
import { submitPoolCreation } from "@/lib/market/pool-betting";

interface Props {
  onClose: () => void;
  onCreated: (market: MutuelMarketRow) => void;
}

interface OptionDraft {
  label: string;
}

type CreateStep = "idle" | "signing" | "sending" | "done" | "error";

export function CreatePoolModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState<OptionDraft[]>([{ label: "" }, { label: "" }]);
  const [closesAt, setClosesAt] = useState("");
  const [feeToken, setFeeToken] = useState<"usdc" | "clawdtrust">("usdc");
  const [betToken, setBetToken] = useState<"usdc" | "clawdtrust">("usdc");
  const [step, setStep] = useState<CreateStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const submitting = step === "signing" || step === "sending";

  const addOption = () => {
    if (options.length >= 8) return;
    setOptions(prev => [...prev, { label: "" }]);
  };
  const removeOption = (i: number) => {
    if (options.length <= 2) return;
    setOptions(prev => prev.filter((_, idx) => idx !== i));
  };
  const updateOption = (i: number, label: string) => {
    setOptions(prev => prev.map((o, idx) => idx === i ? { label } : o));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (title.trim().length < 5) { setError("Title must be at least 5 characters."); return; }
    if (options.some(o => !o.label.trim())) { setError("All options must have a label."); return; }
    if (!closesAt) { setError("Prediction close date is required."); return; }

    // Get wallet from Supabase session
    const supabase = createClient();
    const { data: { user } } = await (supabase as any).auth.getUser();
    const walletAddress: string = user?.user_metadata?.wallet_address ?? "";
    const walletType = (localStorage.getItem("walletType") ?? "phantom") as Parameters<typeof submitPoolCreation>[0]["walletType"];

    if (!walletAddress) {
      setError("Wallet not connected. Please sign in first.");
      return;
    }

    // Step 1: Request wallet signature for creation fee
    setStep("signing");
    const txResult = await submitPoolCreation({
      title: title.trim(),
      feeToken,
      walletAddress,
      walletType,
    });

    if (!txResult.success) {
      setStep("error");
      setError(txResult.error);
      return;
    }

    // Step 2: POST to API with tx signature
    setStep("sending");
    try {
      const res = await fetch("/api/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          options: options.map(o => ({ label: o.label.trim() })),
          betting_closes_at: new Date(closesAt).toISOString(),
          creation_fee_token: feeToken,
          creation_tx: txResult.signature,
          bet_token: betToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStep("error");
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setStep("done");
      setTimeout(() => onCreated(data as MutuelMarketRow), 1200);
    } catch {
      setStep("error");
      setError("Network error, please try again.");
    }
  }

  const feeLabel = feeToken === "usdc" ? "5 USDC" : "500,000 ClawdTrust";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">
      <div className="relative w-full max-w-lg rounded-t-2xl border border-border bg-card p-6 shadow-xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="size-5" />
        </button>

        <h2 className="mb-1 text-lg font-bold text-foreground">Create a Pool</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          An admin will review your pool before it goes live.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Question / Title *
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Who will win the 2026 World Cup?"
              maxLength={200}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add context or resolution criteria…"
              rows={2}
              maxLength={1000}
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Options */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Options * (2–8)
            </label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={opt.label}
                  onChange={e => updateOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  maxLength={80}
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
            {options.length < 8 && (
              <button
                type="button"
                onClick={addOption}
                className="flex items-center gap-1.5 self-start rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <Plus className="size-3.5" />
                Add option
              </button>
            )}
          </div>

          {/* Betting close date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Predictions close at *
            </label>
            <input
              type="datetime-local"
              value={closesAt}
              min={new Date(Date.now() + 3_600_000).toISOString().slice(0, 16)}
              onChange={e => setClosesAt(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Bet token */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prediction token (token used for all predictions)
            </label>
            <div className="flex gap-2">
              {(["usdc", "clawdtrust"] as const).map(token => (
                <button
                  key={token}
                  type="button"
                  onClick={() => setBetToken(token)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition-colors ${
                    betToken === token
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <TokenLogo token={token} className="size-4" />
                  {token === "usdc" ? "USDC" : "ClawdTrust"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              All predictors must use {betToken === "usdc" ? "USDC" : "ClawdTrust"} to participate. Winnings paid in the same token.
            </p>
          </div>

          {/* Creation fee token */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Creation fee
            </label>
            <div className="flex gap-2">
              {(["usdc", "clawdtrust"] as const).map(token => (
                <button
                  key={token}
                  type="button"
                  onClick={() => setFeeToken(token)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2 text-sm font-semibold transition-colors ${
                    feeToken === token
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <TokenLogo token={token} className="size-4" />
                  {token === "usdc" ? "5 USDC" : "500K ClawdTrust"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Fee is {feeLabel}. Refunded if rejected by admin.
            </p>
          </div>

          {/* Step feedback */}
          {step === "signing" && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm text-amber-500">
              <Loader2 className="size-4 animate-spin" />
              Waiting for wallet signature…
            </div>
          )}
          {step === "sending" && (
            <div className="flex items-center gap-2 rounded-xl bg-blue-500/10 px-3 py-2.5 text-sm text-blue-500">
              <Loader2 className="size-4 animate-spin" />
              Submitting pool…
            </div>
          )}
          {step === "done" && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-500">
              <CheckCircle className="size-4" />
              Pool submitted! Pending admin review.
            </div>
          )}
          {step === "error" && error && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || step === "done"}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {step === "signing" ? "Waiting for signature…"
              : step === "sending" ? "Submitting…"
              : step === "done"    ? "Pool submitted!"
              : `Submit Pool · ${feeLabel}`}
          </button>
        </form>
      </div>
    </div>
  );
}

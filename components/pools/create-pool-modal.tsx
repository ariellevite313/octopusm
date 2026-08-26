"use client";

import { useRef, useState } from "react";
import { Camera, X, Plus, Trash2, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { TokenLogo } from "@/components/shared/token-logo";
import { MutuelMarketRow } from "@/lib/supabase/types";
import { useAuth } from "@/providers/auth-provider";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import { submitPoolCreation } from "@/lib/market/pool-betting";

type Category = CategorySlug;

interface Props {
  onClose:   () => void;
  onCreated: (market: MutuelMarketRow) => void;
}

interface OptionDraft {
  label:     string;
  image_url?: string;
}

type CreateStep = "idle" | "paying" | "sending" | "done" | "error";

// ─── Image upload widget ──────────────────────────────────────────────────────

function ImageUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch("/api/admin/upload-image", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      onChange(body.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Icon image (optional)
      </label>
      <div className="flex items-center gap-3">
        <div
          className="relative size-16 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-dashed border-border bg-muted/30 transition-colors hover:bg-muted/50 flex items-center justify-center"
          onClick={() => fileRef.current?.click()}
        >
          {value ? (
            <>
              <img src={value} alt="" className="size-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
                <Camera className="size-4 text-white" />
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange(""); }}
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
              >
                <X className="size-3" />
              </button>
            </>
          ) : uploading ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <Camera className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">Square icon displayed beside your market title.</p>
          <p className="text-[10px] text-muted-foreground">JPG, PNG, WEBP or GIF · max 2MB</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-1 self-start rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            {value ? "Change icon" : "Upload icon"}
          </button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function CreatePoolModal({ onClose, onCreated }: Props) {
  const { walletAddress, walletType } = useAuth();

  const [title,          setTitle]          = useState("");
  const [description,    setDescription]    = useState("");
  const [coverImage,     setCoverImage]     = useState("");
  const [options,        setOptions]        = useState<OptionDraft[]>([{ label: "" }, { label: "" }]);
  const [closesAt,       setClosesAt]       = useState("");
  const [category,       setCategory]       = useState<Category>("mentions");
  const [betToken,       setBetToken]       = useState<"usdc" | "clawdtrust">("usdc");
  const [feeToken,       setFeeToken]       = useState<"usdc" | "clawdtrust">("usdc");
  const [step,           setStep]           = useState<CreateStep>("idle");
  const [errorMsg,       setErrorMsg]       = useState<string | null>(null);

  const submitting = step === "paying" || step === "sending";

  const addOption    = () => { if (options.length < 8) setOptions(prev => [...prev, { label: "" }]); };
  const removeOption = (i: number) => { if (options.length > 2) setOptions(prev => prev.filter((_, idx) => idx !== i)); };
  const updateOption = (i: number, label: string) => {
    if (step === "error") { setStep("idle"); setErrorMsg(null); }
    setOptions(prev => prev.map((o, idx) => idx === i ? { ...o, label } : o));
  };
  const updateOptionImage = (i: number, image_url: string) =>
    setOptions(prev => prev.map((o, idx) => idx === i ? { ...o, image_url } : o));

  const optionFileRefs = useRef<(HTMLInputElement | null)[]>([]);

  async function handleOptionImage(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch("/api/admin/upload-image", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      updateOptionImage(i, body.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      if (optionFileRefs.current[i]) optionFileRefs.current[i]!.value = "";
    }
  }

  function resetError() {
    if (step === "error") { setStep("idle"); setErrorMsg(null); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    // ── Validation ──────────────────────────────────────────────────────────
    if (title.trim().length < 5) { toast.error("Title must be at least 5 characters."); return; }
    for (const o of options) {
      if (!o.label.trim() || o.label.trim().length < 2) {
        toast.error("Each option must be at least 2 characters."); return;
      }
    }
    const labels = options.map(o => o.label.trim().toLowerCase());
    if (new Set(labels).size !== labels.length) { toast.error("Options must be unique."); return; }
    if (!closesAt) { toast.error("Prediction close date is required."); return; }
    const closesAtDate = new Date(closesAt);
    if (isNaN(closesAtDate.getTime()) || closesAtDate.getTime() < Date.now() + 60 * 60 * 1000) {
      toast.error("Closing date must be at least 1 hour from now."); return;
    }
    if (!walletAddress) { toast.error("Wallet not connected. Please sign in first."); return; }
    if (!walletType) { toast.error("Wallet type unknown. Please reconnect."); return; }

    // ── Step 1: on-chain payment ────────────────────────────────────────────
    setStep("paying");
    const payResult = await submitPoolCreation({
      title,
      feeToken,
      walletAddress,
      walletType,
    });

    if (!payResult.success) {
      const rawMsg = payResult.error ?? "Payment failed.";
      const isUserCancel = /cancel|reject|authorized|denied|declined/i.test(rawMsg);
      const msg = isUserCancel ? "Transaction cancelled. Please try again." : rawMsg;
      setStep("error");
      setErrorMsg(msg);
      if (!isUserCancel) toast.error(msg);
      return;
    }

    // ── Step 2: create market via API ───────────────────────────────────────
    setStep("sending");
    try {
      const closesAtUtc = new Date(closesAt).toISOString();
      const res = await fetch("/api/pools", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:              title.trim(),
          description:        description.trim() || null,
          cover_image_src:    coverImage || null,
          options:            options.map(o => ({ label: o.label.trim(), image_url: o.image_url || null })),
          category,
          betting_closes_at:  closesAtUtc,
          bet_token:          betToken,
          creation_fee_token: feeToken,
          creation_tx:        payResult.signature,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStep("error");
        const msg = data.error ?? "Something went wrong.";
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }
      setStep("done");
      setTimeout(() => { onCreated(data as MutuelMarketRow); }, 1200);
    } catch {
      setStep("error");
      const msg = "Network error, please try again.";
      setErrorMsg(msg);
      toast.error(msg);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">
      <div className="relative w-full max-w-lg rounded-t-2xl border border-border bg-card p-6 shadow-xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="size-5" />
        </button>

        <h2 className="mb-1 text-lg font-bold text-foreground">Create a Market</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          An admin will review your market before it goes live.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Question / Title *
            </label>
            <input
              value={title}
              onChange={e => { resetError(); setTitle(e.target.value); }}
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

          {/* Cover image */}
          <ImageUpload value={coverImage} onChange={setCoverImage} />

          {/* Options */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Options * (2–8)
            </label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => optionFileRefs.current[i]?.click()}
                  className="relative size-9 shrink-0 overflow-hidden rounded-lg border border-dashed border-border bg-muted/30 flex items-center justify-center transition-colors hover:bg-muted/60"
                  title="Add image"
                >
                  {opt.image_url ? (
                    <>
                      <img src={opt.image_url} alt="" className="size-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
                        <Camera className="size-3 text-white" />
                      </div>
                    </>
                  ) : (
                    <Camera className="size-4 text-muted-foreground" />
                  )}
                </button>
                <input
                  ref={el => { optionFileRefs.current[i] = el; }}
                  type="file" accept="image/*" className="hidden"
                  onChange={e => void handleOptionImage(i, e)}
                />
                <input
                  value={opt.label}
                  onChange={e => updateOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  maxLength={80}
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                {opt.image_url && (
                  <button
                    type="button"
                    onClick={() => updateOptionImage(i, "")}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
                    title="Remove image"
                  >
                    <X className="size-4" />
                  </button>
                )}
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
              onChange={e => { resetError(); setClosesAt(e.target.value); }}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-[10px] text-muted-foreground">Time is interpreted in your local timezone.</p>
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Category
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as Category)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 capitalize"
            >
              {CATEGORIES.map(c => (
                <option key={c.slug} value={c.slug}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Bet token */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prediction token
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
                  <TokenLogo token={token} className="size-5" />
                  {token === "usdc" ? "USDC" : "ClawdTrust"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Token used by all predictors. Winnings paid in the same token.
            </p>
          </div>

          {/* Creation fee */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pay creation fee with
            </label>
            <div className="flex gap-2">
              {(["usdc", "clawdtrust"] as const).map(token => (
                <button
                  key={token}
                  type="button"
                  onClick={() => setFeeToken(token)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition-colors ${
                    feeToken === token
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <TokenLogo token={token} className="size-5" />
                  {token === "usdc" ? "2 USDC" : "500K CLT"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              One-time fee sent on-chain before your market is submitted.
            </p>
          </div>

          {/* Step feedback */}
          {step === "paying" && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm text-amber-500">
              <Loader2 className="size-4 animate-spin" />
              Waiting for payment confirmation…
            </div>
          )}
          {step === "sending" && (
            <div className="flex items-center gap-2 rounded-xl bg-blue-500/10 px-3 py-2.5 text-sm text-blue-500">
              <Loader2 className="size-4 animate-spin" />
              Submitting market…
            </div>
          )}
          {step === "done" && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-500">
              <CheckCircle className="size-4" />
              Market submitted! Pending admin review.
            </div>
          )}
          {step === "error" && errorMsg && (
            <div className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || step === "done"}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {step === "paying"  ? "Waiting for payment…"
             : step === "sending" ? "Submitting…"
             : step === "done"    ? "Market submitted!"
             : step === "error"   ? "Try again"
             : `Pay ${feeToken === "usdc" ? "2 USDC" : "500K CLT"} & Submit`}
          </button>
        </form>
      </div>
    </div>
  );
}

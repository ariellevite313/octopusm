"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import {
  Check, ChevronRight, ChevronLeft, Upload, X, Plus, Trash2,
  Globe, Twitter, MessageCircle, Hash, ExternalLink, Info,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";

// ─── Types ─────────────────────────────────────────────────────────────────

type FeeRecipient = { address: string; share_pct: number };

type WizardData = {
  // Étape 1 — Identité
  name: string;
  ticker: string;
  category: string;
  description: string;
  logo_file: File | null;
  logo_preview: string | null;
  whitepaper_file: File | null;
  // Étape 2 — Réseaux sociaux
  website: string;
  twitter: string;
  telegram: string;
  discord: string;
  other_social: string;
  // Étape 3 — Options avancées
  supply: number;
  creator_fee_pct: 1;
  fee_recipients: FeeRecipient[];
  share_top100: boolean;
  share_top100_pct: number;
  first_buy_enabled: boolean;
  first_buy_amount: number;
  is_scheduled: boolean;
  scheduled_at: string;
};

const INITIAL: WizardData = {
  name: "", ticker: "", category: "Meme", description: "",
  logo_file: null, logo_preview: null, whitepaper_file: null,
  website: "", twitter: "", telegram: "", discord: "", other_social: "",
  supply: 1_000_000_000,
  creator_fee_pct: 1,
  fee_recipients: [],
  share_top100: false, share_top100_pct: 5,
  first_buy_enabled: false, first_buy_amount: 0.1,
  is_scheduled: false, scheduled_at: "",
};

const CATEGORIES = ["Meme","Utility","AI","Gaming","DeFi","NFT","x402"];
const SUPPLY_MIN = 10_000_000;
const SUPPLY_MAX = 1_000_000_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSupply(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(0)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  return n.toLocaleString();
}

function tomorrowMin(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 16);
}
function maxSchedule(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 16);
}

// ─── Progress bar ───────────────────────────────────────────────────────────

const STEPS = ["Identity", "Socials", "Advanced", "Review"];

function StepBar({ current }: { current: number }) {
  return (
    <div className="mb-8 flex items-center gap-0">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {i > 0 && <div className={`h-px flex-1 ${done ? "bg-primary" : "bg-border"}`} />}
              <div className={`flex size-7 items-center justify-center rounded-full text-xs font-bold transition-colors
                ${done ? "bg-primary text-primary-foreground"
                  : active ? "border-2 border-primary text-primary"
                  : "border-2 border-border text-muted-foreground"}`}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`h-px flex-1 ${done ? "bg-primary" : "bg-border"}`} />}
            </div>
            <span className={`mt-1.5 text-[10px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Étape 1 — Identité ─────────────────────────────────────────────────────

function StepIdentity({ data, set, errors }: {
  data: WizardData;
  set: (k: keyof WizardData, v: unknown) => void;
  errors: Record<string, string>;
}) {
  const logoRef = useRef<HTMLInputElement>(null);
  const pdfRef  = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<{ name?: boolean; ticker?: boolean }>({});

  const checkAvailability = useCallback(async () => {
    if (!data.name || !data.ticker) return;
    setChecking(true);
    try {
      const res = await fetch(
        `/api/launchpad/check-name?name=${encodeURIComponent(data.name)}&ticker=${encodeURIComponent(data.ticker)}`
      );
      const json = await res.json() as { nameAvailable: boolean; tickerAvailable: boolean };
      setAvailability({ name: json.nameAvailable, ticker: json.tickerAvailable });
    } catch {
      /* ignore */
    } finally {
      setChecking(false);
    }
  }, [data.name, data.ticker]);

  const VALID_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!VALID_LOGO_TYPES.includes(file.type)) {
      toast.error("Unsupported format. Use PNG, JPG, WebP, or GIF");
      return;
    }
    if (file.size > 5 * 1024 * 1024) { toast.error("Logo max 5 MB"); return; }
    if (data.logo_preview) URL.revokeObjectURL(data.logo_preview);
    set("logo_file", file);
    set("logo_preview", URL.createObjectURL(file));
  }

  function handlePdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast.error("PDF max 20 MB"); return; }
    set("whitepaper_file", file);
  }

  return (
    <div className="space-y-5">

      {/* Logo upload */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Token Logo *</label>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => logoRef.current?.click()}
            className="relative flex size-20 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted/30 transition-colors hover:border-primary/50"
          >
            {data.logo_preview ? (
              <Image src={data.logo_preview} alt="Logo" fill className="object-cover" unoptimized />
            ) : (
              <Upload className="size-6 text-muted-foreground" />
            )}
          </button>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>PNG, JPG, GIF — max 5 MB</p>
            <p>Recommended: 400×400 px</p>
            {data.logo_file && (
              <button type="button" onClick={() => { if (data.logo_preview) URL.revokeObjectURL(data.logo_preview); set("logo_file", null); set("logo_preview", null); }}
                className="flex items-center gap-1 text-red-500 hover:text-red-600">
                <X className="size-3" /> Remove
              </button>
            )}
          </div>
        </div>
        <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleLogo} />
        {errors.logo && <p className="mt-1 text-xs text-red-500">{errors.logo}</p>}
      </div>

      {/* Nom + Ticker */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Token Name *</label>
          <input
            value={data.name}
            onChange={(e) => { set("name", e.target.value); setAvailability({}); }}
            onBlur={checkAvailability}
            placeholder="e.g. Octopus Coin"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {availability.name === true && <p className="mt-1 text-xs text-emerald-500">✓ Available</p>}
          {availability.name === false && <p className="mt-1 text-xs text-red-500">✗ Already taken</p>}
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Ticker *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <input
              value={data.ticker}
              onChange={(e) => { set("ticker", e.target.value.toUpperCase().slice(0, 10)); setAvailability({}); }}
              onBlur={checkAvailability}
              placeholder="OMERO"
              className="w-full rounded-xl border border-border bg-background pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary uppercase"
            />
          </div>
          {availability.ticker === true && <p className="mt-1 text-xs text-emerald-500">✓ Available</p>}
          {availability.ticker === false && <p className="mt-1 text-xs text-red-500">✗ Already taken</p>}
          {checking && <p className="mt-1 text-xs text-muted-foreground">Checking…</p>}
          {errors.ticker && <p className="mt-1 text-xs text-red-500">{errors.ticker}</p>}
        </div>
      </div>

      {/* Catégorie */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Category *</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => set("category", cat)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                data.category === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Description *</label>
        <textarea
          value={data.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Describe your token project…"
          rows={4}
          maxLength={500}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <p className="mt-0.5 text-right text-xs text-muted-foreground">{data.description.length}/500</p>
        {errors.description && <p className="mt-1 text-xs text-red-500">{errors.description}</p>}
      </div>

      {/* Whitepaper PDF */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          Whitepaper <span className="text-muted-foreground font-normal">(optional, PDF, max 20 MB)</span>
        </label>
        <button
          type="button"
          onClick={() => pdfRef.current?.click()}
          className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground hover:border-primary/50 transition-colors"
        >
          <Upload className="size-4" />
          {data.whitepaper_file ? data.whitepaper_file.name : "Upload PDF"}
          {data.whitepaper_file && (
            <X className="size-4 ml-auto text-red-500" onClick={(e) => { e.stopPropagation(); set("whitepaper_file", null); }} />
          )}
        </button>
        <input ref={pdfRef} type="file" accept=".pdf" className="hidden" onChange={handlePdf} />
      </div>

    </div>
  );
}

// ─── Étape 2 — Réseaux sociaux ───────────────────────────────────────────────

function SocialInput({ icon, label, value, onChange, placeholder }: {
  icon: React.ReactNode; label: string; value: string;
  onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  );
}

function StepSocials({ data, set, errors }: { data: WizardData; set: (k: keyof WizardData, v: unknown) => void; errors: Record<string, string> }) {
  return (
    <div className="space-y-4">
      <SocialInput icon={<Globe className="size-4" />}           label="Website (optional)"          value={data.website}      onChange={(v) => set("website", v)}      placeholder="https://yourtoken.com" />
      {errors.website  && <p className="-mt-3 text-xs text-red-500">{errors.website}</p>}
      <SocialInput icon={<Twitter className="size-4" />}         label="Twitter / X (optional)"      value={data.twitter}      onChange={(v) => set("twitter", v)}      placeholder="https://x.com/yourtoken" />
      {errors.twitter  && <p className="-mt-3 text-xs text-red-500">{errors.twitter}</p>}
      <SocialInput icon={<MessageCircle className="size-4" />}   label="Telegram (optional)"         value={data.telegram}     onChange={(v) => set("telegram", v)}     placeholder="https://t.me/yourtoken" />
      {errors.telegram && <p className="-mt-3 text-xs text-red-500">{errors.telegram}</p>}
      <SocialInput icon={<Hash className="size-4" />}            label="Discord (optional)" value={data.discord}      onChange={(v) => set("discord", v)}      placeholder="https://discord.gg/yourtoken" />
      {errors.discord      && <p className="-mt-3 text-xs text-red-500">{errors.discord}</p>}
      <SocialInput icon={<ExternalLink className="size-4" />}    label="Other (optional)"   value={data.other_social} onChange={(v) => set("other_social", v)} placeholder="https://…" />
      {errors.other_social && <p className="-mt-3 text-xs text-red-500">{errors.other_social}</p>}
    </div>
  );
}

// ─── Étape 3 — Options avancées ──────────────────────────────────────────────

function StepAdvanced({ data, set, errors }: { data: WizardData; set: (k: keyof WizardData, v: unknown) => void; errors: Record<string, string> }) {
  function addRecipient() {
    if (data.fee_recipients.length >= 4) return;
    set("fee_recipients", [...data.fee_recipients, { address: "", share_pct: 0 }]);
  }
  function updateRecipient(i: number, field: keyof FeeRecipient, val: string | number) {
    const updated = data.fee_recipients.map((r, idx) => idx === i ? { ...r, [field]: val } : r);
    set("fee_recipients", updated);
  }
  function removeRecipient(i: number) {
    set("fee_recipients", data.fee_recipients.filter((_, idx) => idx !== i));
  }

  const supplyPct = ((data.supply - SUPPLY_MIN) / (SUPPLY_MAX - SUPPLY_MIN)) * 100;

  return (
    <div className="space-y-6">

      {/* Supply */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">Token Supply</label>
          <span className="font-mono text-sm font-semibold text-primary">{formatSupply(data.supply)}</span>
        </div>
        <input
          type="range"
          min={SUPPLY_MIN}
          max={SUPPLY_MAX}
          step={10_000_000}
          value={data.supply}
          onChange={(e) => set("supply", Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>10M</span><span>1B</span>
        </div>
        <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" />
          A unique mint address will be generated for your token.
        </p>
      </div>

      {/* Frais créateur — fixé à 1% */}
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
        <p className="text-sm font-medium text-foreground">Trading fees</p>
        <p className="text-xs text-muted-foreground mt-0.5">2% trading fee per trade</p>
      </div>

      {/* Partage frais — jusqu'à 4 adresses */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">
            Share creator fees <span className="text-muted-foreground font-normal">(optional, max 4)</span>
          </label>
          {data.fee_recipients.length < 4 && (
            <button type="button" onClick={addRecipient}
              className="flex items-center gap-1 text-xs text-primary hover:opacity-80">
              <Plus className="size-3.5" /> Add address
            </button>
          )}
        </div>
        {data.fee_recipients.length === 0 && (
          <p className="text-xs text-muted-foreground">No co-recipients — 100% goes to your wallet.</p>
        )}
        <div className="space-y-2">
          {data.fee_recipients.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={r.address}
                onChange={(e) => updateRecipient(i, "address", e.target.value)}
                placeholder="Solana wallet address"
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="relative">
                <input
                  type="number" min={1} max={99}
                  value={r.share_pct}
                  onChange={(e) => updateRecipient(i, "share_pct", Number(e.target.value))}
                  className="w-16 rounded-xl border border-border bg-background px-2 py-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
              <button type="button" onClick={() => removeRecipient(i)}
                className="text-muted-foreground hover:text-red-500 transition-colors">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
        {errors.fee_recipients && (
          <p className="mt-1 text-xs text-red-500">{errors.fee_recipients}</p>
        )}
      </div>

      {/* First buy */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">First Buy</p>
            <p className="text-xs text-muted-foreground">Buy tokens immediately at mint</p>
          </div>
          <button
            type="button"
            onClick={() => set("first_buy_enabled", !data.first_buy_enabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${data.first_buy_enabled ? "bg-primary" : "bg-muted"}`}
          >
            <span className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${data.first_buy_enabled ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>
        {data.first_buy_enabled && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                type="number" min={0.01} max={100} step={0.01}
                value={data.first_buy_amount}
                onChange={(e) => set("first_buy_amount", Number(e.target.value))}
                className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-sm text-muted-foreground">SOL</span>
            </div>
            {errors.first_buy_amount && (
              <p className="text-xs text-red-500">{errors.first_buy_amount}</p>
            )}
          </div>
        )}
      </div>

      {/* Lancement programmé */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Scheduled Launch</p>
            <p className="text-xs text-muted-foreground">+0.1 SOL · Token not tradeable until chosen date</p>
          </div>
          <button
            type="button"
            onClick={() => set("is_scheduled", !data.is_scheduled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${data.is_scheduled ? "bg-primary" : "bg-muted"}`}
          >
            <span className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${data.is_scheduled ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>
        {data.is_scheduled && (
          <div className="space-y-1">
            <input
              type="datetime-local"
              min={tomorrowMin()}
              max={maxSchedule()}
              value={data.scheduled_at}
              onChange={(e) => set("scheduled_at", e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {errors.scheduled_at && (
              <p className="text-xs text-red-500">{errors.scheduled_at}</p>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

// ─── Étape 4 — Récapitulatif ─────────────────────────────────────────────────

function StepReview({ data }: { data: WizardData }) {
  // Fee set by the DBC_CONFIG_KEY (3% total: 2% platform + 1% creator)
  const totalFee = 3;
  // 0.05 SOL creation fee (platform) + optional scheduled fee
  const mintCost = 0.05 + (data.is_scheduled ? 0.1 : 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Review everything before signing. This action is irreversible.</p>

      {/* Token */}
      <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Token</p>
        <div className="flex items-center gap-3">
          {data.logo_preview && (
            <Image src={data.logo_preview} alt="Logo" width={44} height={44} className="rounded-xl object-cover" unoptimized />
          )}
          <div>
            <p className="font-semibold text-foreground">{data.name} <span className="text-muted-foreground font-normal">${data.ticker}</span></p>
            <p className="text-xs text-muted-foreground">{data.category} · {formatSupply(data.supply)} supply</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{data.description}</p>
      </div>

      {/* Socials */}
      <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Socials</p>
        {[
          { label: "Website", value: data.website },
          { label: "Twitter", value: data.twitter },
          { label: "Telegram", value: data.telegram },
          { label: "Discord", value: data.discord },
          { label: "Other", value: data.other_social },
        ].filter(s => s.value).map(s => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span className="w-16 text-xs text-muted-foreground shrink-0">{s.label}</span>
            <span className="truncate text-foreground">{s.value}</span>
          </div>
        ))}
      </div>

      {/* Options */}
      <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Options</p>
        <Row label="Trading fee" value={`${totalFee}% per trade`} />
        {data.fee_recipients.length > 0 && (
          <Row label="Fee sharing" value={`${data.fee_recipients.length} co-recipient(s)`} />
        )}
        {data.first_buy_enabled && (
          <Row label="First buy" value={`${data.first_buy_amount} SOL`} />
        )}
        {data.is_scheduled && data.scheduled_at && (
          <Row label="Launch date" value={new Date(data.scheduled_at).toLocaleString()} />
        )}
        <Row label="Mint address" value="Auto-generated" highlight />
      </div>

      {/* Coût */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Cost</p>
        <div className="space-y-1">
          <Row label="Token creation" value="0.05 SOL" />
          {data.is_scheduled && <Row label="Scheduled launch" value="0.10 SOL" />}
          {data.first_buy_enabled && <Row label="First buy" value={`${data.first_buy_amount} SOL`} />}
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <span className="text-sm font-semibold text-foreground">Total</span>
            <span className="text-sm font-bold text-primary">
              ~{(mintCost + (data.first_buy_enabled ? data.first_buy_amount : 0)).toFixed(2)} SOL
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${highlight ? "font-mono text-violet-600 dark:text-violet-400" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

// ─── Validation ──────────────────────────────────────────────────────────────

function isValidUrl(s: string): boolean {
  try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:"; }
  catch { return false; }
}

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function validate(step: number, data: WizardData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (step === 0) {
    if (!data.logo_file) errors.logo = "Logo is required";
    if (!data.name.trim()) errors.name = "Name is required";
    if (!data.ticker.trim()) errors.ticker = "Ticker is required";
    if (!data.description.trim()) errors.description = "Description is required";
  }
  if (step === 1) {
    if (data.website && !isValidUrl(data.website)) errors.website = "Enter a valid URL (e.g. https://yourtoken.com)";
    if (data.twitter && !isValidUrl(data.twitter)) errors.twitter = "Enter a valid URL (e.g. https://x.com/yourtoken)";
    if (data.telegram && !isValidUrl(data.telegram)) errors.telegram = "Enter a valid URL (e.g. https://t.me/yourtoken)";
    if (data.discord && !isValidUrl(data.discord)) errors.discord = "Enter a valid URL";
    if (data.other_social && !isValidUrl(data.other_social)) errors.other_social = "Enter a valid URL";
  }
  if (step === 2) {
    if (data.is_scheduled && !data.scheduled_at) errors.scheduled_at = "Please pick a launch date";
    if (data.first_buy_enabled && data.first_buy_amount < 0.01)
      errors.first_buy_amount = "Minimum first buy is 0.01 SOL";
    if (data.fee_recipients.length > 0) {
      const hasInvalidAddr = data.fee_recipients.some(r => !BASE58_RE.test(r.address.trim()));
      if (hasInvalidAddr) errors.fee_recipients = "One or more wallet addresses are invalid";
      const totalPct = data.fee_recipients.reduce((s, r) => s + r.share_pct, 0);
      if (totalPct > 100) errors.fee_recipients = `Total share (${totalPct}%) exceeds 100%`;
    }
  }
  return errors;
}

// ─── Wizard principal ────────────────────────────────────────────────────────

export function CreateTokenWizard() {
  const router = useRouter();
  const { walletAddress } = useAuth();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function set(k: keyof WizardData, v: unknown) {
    setData((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => { const e = { ...prev }; delete e[k as string]; return e; });
  }

  function next() {
    const errs = validate(step, data);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setStep((s) => s + 1);
  }

  function back() { setStep((s) => s - 1); }

  async function submit() {
    if (!walletAddress) { toast.error("Connect your wallet first"); return; }
    setSubmitting(true);
    try {
      const form = new FormData();
      if (data.logo_file) form.append("logo", data.logo_file);
      if (data.whitepaper_file) form.append("whitepaper", data.whitepaper_file);
      form.append("payload", JSON.stringify({
        name: data.name, ticker: data.ticker, category: data.category,
        description: data.description, website: data.website,
        twitter: data.twitter, telegram: data.telegram,
        discord: data.discord, other_social: data.other_social,
        supply: data.supply,
        creator_fee_pct: data.creator_fee_pct,
        fee_recipients: data.fee_recipients,
        share_top100: false,
        share_top100_pct: 0,
        first_buy_enabled: data.first_buy_enabled,
        first_buy_amount: data.first_buy_amount,
        is_scheduled: data.is_scheduled,
        scheduled_at: data.is_scheduled ? data.scheduled_at : null,
        creator_wallet: walletAddress,
      }));

      const res = await fetch("/api/launchpad/create", { method: "POST", body: form });
      const json = await res.json() as { id?: string; error?: string };

      if (!res.ok || json.error) {
        toast.error(json.error ?? "Failed to create token");
        return;
      }

      toast.success("Token created! Redirecting to your launch page…");
      router.push(`/launchpad/${json.id}`);
    } catch (e) {
      toast.error("Unexpected error");
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  if (!walletAddress) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-sm font-medium text-foreground mb-1">Connect your wallet to launch a token</p>
        <p className="text-xs text-muted-foreground">You need a Solana wallet to create and sign the transaction.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <StepBar current={step} />

      <div className="min-h-[400px]">
        {step === 0 && <StepIdentity data={data} set={set} errors={errors} />}
        {step === 1 && <StepSocials  data={data} set={set} errors={errors} />}
        {step === 2 && <StepAdvanced data={data} set={set} errors={errors} />}
        {step === 3 && <StepReview   data={data} />}
      </div>

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
        {step > 0 ? (
          <button type="button" onClick={back}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="size-4" /> Back
          </button>
        ) : <div />}

        {step < 3 ? (
          <button type="button" onClick={next}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
            Continue <ChevronRight className="size-4" />
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={submitting}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
            {submitting ? "Creating…" : "🚀 Launch Token"}
          </button>
        )}
      </div>
    </div>
  );
}

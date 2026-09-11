"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import {
  Check, ChevronRight, ChevronLeft, Upload, X, Plus, Trash2,
  Globe, Twitter, MessageCircle, Hash, ExternalLink,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { createWalletClient, createPublicClient, custom, parseEventLogs } from "viem";
import { arcTestnet } from "@/lib/arc-chain";
import {
  ARC_FACTORY_ADDRESS, FACTORY_ABI,
  ARC_USDC_ADDRESS, ERC20_APPROVE_ABI,
  ARC_TREASURY_ADDRESS, ARC_CREATION_FEE_USDC,
} from "@/lib/arc-launchpad";

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
  // Étape 3 — Options avancées (Solana)
  creator_fee_pct: 1;
  fee_recipients: FeeRecipient[];
  share_top100: boolean;
  share_top100_pct: number;
  first_buy_enabled: boolean;
  first_buy_amount: number;
  is_scheduled: boolean;
  scheduled_at: string;
  // Étape 3 — Options Arc
  arc_supply: number;          // nombre de tokens (ex: 1_000_000_000)
  arc_first_buy_enabled: boolean;
  arc_first_buy_usdc: number;  // montant USDC pour le premier achat
};

const INITIAL: WizardData = {
  name: "", ticker: "", category: "Meme", description: "",
  logo_file: null, logo_preview: null, whitepaper_file: null,
  website: "", twitter: "", telegram: "", discord: "", other_social: "",
  creator_fee_pct: 1,
  fee_recipients: [],
  share_top100: false, share_top100_pct: 5,
  first_buy_enabled: false, first_buy_amount: 0.1,
  is_scheduled: false, scheduled_at: "",
  arc_supply: 1_000_000_000,
  arc_first_buy_enabled: false,
  arc_first_buy_usdc: 10,
};

const CATEGORIES = ["Meme","Utility","AI","Gaming","DeFi","NFT","x402"];

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function StepBar({ current, steps = STEPS }: { current: number; steps?: string[] }) {
  return (
    <div className="mb-8 flex items-center gap-0">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={`${label}-${i}`} className="flex flex-1 flex-col items-center">
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

  return (
    <div className="space-y-6">

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

// ─── Étape 3 Arc — Options ──────────────────────────────────────────────────

function StepArcOptions({
  data, set, errors,
}: {
  data: WizardData;
  set: (k: keyof WizardData, v: unknown) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-5 pt-2">

      {/* First buy en USDC */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">First Buy</p>
            <p className="text-xs text-muted-foreground mt-0.5">Buy tokens immediately after deployment.</p>
          </div>
          <button
            type="button"
            onClick={() => set("arc_first_buy_enabled", !data.arc_first_buy_enabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              data.arc_first_buy_enabled ? "bg-primary" : "bg-muted"
            }`}
          >
            <span className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${
              data.arc_first_buy_enabled ? "translate-x-4" : "translate-x-0.5"
            }`} />
          </button>
        </div>
        {data.arc_first_buy_enabled && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                type="number" min={1} max={1000} step={1}
                value={data.arc_first_buy_usdc}
                onChange={(e) => set("arc_first_buy_usdc", Number(e.target.value))}
                className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-sm text-muted-foreground">USDC</span>
            </div>
            {errors.arc_first_buy_usdc && (
              <p className="text-xs text-red-500">{errors.arc_first_buy_usdc}</p>
            )}
          </div>
        )}
      </div>

      {/* Info bonding curve */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 dark:border-blue-900/40 dark:bg-blue-950/10 p-4">
        <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1">Bonding curve</p>
        <p className="text-xs text-blue-700 dark:text-blue-400">
          Linear curve · Graduates at 10,000 USDC raised · 1% platform fee · Fully on-chain via Arc Launchpad contract.
        </p>
      </div>

    </div>
  );
}

// ─── Étape 4 — Récapitulatif ─────────────────────────────────────────────────

function StepReview({ data, chain = "solana" }: { data: WizardData; chain?: "solana" | "arc" }) {
  // 0.05 SOL platform fee + 0.02449768 SOL Solana/Meteora account rent + optional scheduled fee
  const PLATFORM_FEE = 0.05;
  const NETWORK_RENT = 0.02449768;
  const mintCost = PLATFORM_FEE + NETWORK_RENT + (data.is_scheduled ? 0.1 : 0);

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
            <p className="text-xs text-muted-foreground">
              {data.category} · {chain === "arc"
                ? `${(data.arc_supply / 1_000_000_000).toFixed(data.arc_supply % 1_000_000_000 === 0 ? 0 : 1)}B supply`
                : "1B supply"}
            </p>
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
        {chain === "arc" ? (
          <>
            <Row label="Supply" value={`${(data.arc_supply / 1_000_000_000).toFixed(data.arc_supply % 1_000_000_000 === 0 ? 0 : 1)}B tokens`} />
            <Row label="Bonding curve" value="Linear" />
            <Row label="Graduation" value="10,000 USDC" />
            <Row label="Platform fee" value={`${ARC_CREATION_FEE_USDC} USDC`} highlight />
            {data.arc_first_buy_enabled && (
              <Row label="First buy" value={`${data.arc_first_buy_usdc} USDC`} />
            )}
            <Row label="Token address" value="Auto-generated" highlight />
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Coût */}
      {chain === "arc" ? (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Cost — Arc Testnet</p>
          <div className="space-y-1">
            <Row label="Gas (deploy ~1M gas)" value="~0.02 USDC" />
            <Row label="Platform fee" value="Free (testnet)" />
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <span className="text-sm font-semibold text-foreground">Total</span>
              <span className="text-sm font-bold text-blue-500">~0.02 USDC</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            MetaMask will open to sign the transaction on Arc Testnet (Chain ID 5042002).
          </p>
          <p className="mt-1 text-xs text-amber-500">
            ⚠️ Phantom must not be set as default EVM wallet. Go to Phantom → Settings → Default wallet → Always ask.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Cost</p>
          <div className="space-y-1">
            <Row label="Platform fee" value="0.05 SOL" />
            <Row label="Network rent (Meteora)" value="~0.0245 SOL" />
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
      )}
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

type InitialData = Partial<Pick<WizardData,
  "name" | "ticker" | "category" | "description" |
  "website" | "twitter" | "telegram" | "discord" | "other_social"
>>;

export function CreateTokenWizard({
  initialData,
  chain = "solana",
}: {
  initialData?: InitialData;
  chain?: "solana" | "arc";
}) {
  const router = useRouter();
  const { walletAddress, walletType, selectedChain } = useAuth();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(() => ({ ...INITIAL, ...initialData }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Réinitialiser le step quand on change de chaîne
  useEffect(() => { setStep(0); setErrors({}); }, [chain]);

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

  async function submitSolana() {
    if (!walletAddress) { toast.error("Connect your wallet first"); return; }
    const form = new FormData();
    if (data.logo_file) form.append("logo", data.logo_file);
    if (data.whitepaper_file) form.append("whitepaper", data.whitepaper_file);
    form.append("payload", JSON.stringify({
      name: data.name, ticker: data.ticker, category: data.category,
      description: data.description, website: data.website,
      twitter: data.twitter, telegram: data.telegram,
      discord: data.discord, other_social: data.other_social,
      supply: 1_000_000_000,
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
    if (!res.ok || json.error) throw new Error(json.error ?? "Failed to create token");
    toast.success("Token created! Redirecting to your launch page…");
    router.push(`/launchpad/${json.id}`);
  }

  async function submitArc() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;

    // Chercher MetaMask spécifiquement — Phantom injecte aussi window.ethereum
    // mais ne supporte pas les réseaux EVM custom comme Arc.
    let eth = w.ethereum;

    // EIP-6963 / multi-provider : chercher MetaMask dans la liste
    if (Array.isArray(eth?.providers)) {
      eth = eth.providers.find((p: any) => p.isMetaMask && !p.isPhantom) ?? eth;
    }

    // Phantom comme provider EVM → rejeter explicitement
    if (!eth || eth.isPhantom) {
      toast.error("Arc requires MetaMask. In Phantom, go to Settings → Default wallet → Always ask, then reload and use MetaMask.", { duration: 8000 });
      return;
    }

    if (!eth.isMetaMask) {
      toast.error("Arc requires MetaMask — please install it and set it as default EVM wallet.");
      return;
    }

    // 1. Request account
    const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
    const account = accounts[0] as `0x${string}`;

    // 2. Switch to Arc Testnet if needed
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x4CEF52" }], // 5042002
      });
    } catch (switchErr: unknown) {
      // 4902 = chaîne inconnue → on l'ajoute
      // 4001 = rejet utilisateur → on propage
      if ((switchErr as { code?: number })?.code === 4001) {
        throw new Error("Network switch rejected by user");
      }
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x4CEF52",
          chainName: "Arc Testnet",
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
          rpcUrls: ["https://rpc.testnet.arc.network"],
          blockExplorerUrls: ["https://testnet.arcscan.app"],
        }],
      });
    }

    // 3. Create viem clients
    // Utilise custom(eth) pour les deux clients — route via MetaMask au lieu d'un
    // appel HTTP direct qui échoue souvent sur mobile (CORS / réseau instable).
    const walletClient = createWalletClient({
      account,
      chain: arcTestnet,
      transport: custom(eth),
    });
    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport: custom(eth),
    });

    // 4. Si first buy activé, approuver USDC pour la factory AVANT de créer
    //    La factory fait le buy en interne, donc elle doit déjà avoir l'allowance.
    const firstBuyUsdcRaw = data.arc_first_buy_enabled && data.arc_first_buy_usdc > 0
      ? BigInt(Math.round(data.arc_first_buy_usdc * 1_000_000)) // 6 décimales
      : 0n;

    if (firstBuyUsdcRaw > 0n) {
      toast.info("Approving USDC for first buy…");
      const approveTx = await walletClient.writeContract({
        address:      ARC_USDC_ADDRESS,
        abi:          ERC20_APPROVE_ABI,
        functionName: "approve",
        args:         [ARC_FACTORY_ADDRESS, firstBuyUsdcRaw * 2n], // ×2 marge
        gasPrice:     BigInt("20000000000"),
      });
      // Attendre la confirmation de l'approval
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 3_000));
        const r = await publicClient.getTransactionReceipt({ hash: approveTx }).catch(() => null);
        if (r) break;
      }
    }

    // 5. Platform creation fee — 10 USDC transféré au treasury
    //    Simple transfer ERC20 depuis le wallet du créateur.
    //    Pas d'approval nécessaire (msg.sender = créateur).
    const creationFeeRaw = BigInt(Math.round(ARC_CREATION_FEE_USDC * 1_000_000)); // 6 décimales
    toast.info(`Platform fee: ${ARC_CREATION_FEE_USDC} USDC…`);
    const feeTxHash = await walletClient.writeContract({
      address:      ARC_USDC_ADDRESS,
      abi:          ERC20_APPROVE_ABI,
      functionName: "transfer",
      args:         [ARC_TREASURY_ADDRESS, creationFeeRaw],
      gasPrice:     BigInt("20000000000"),
    });
    // Attendre confirmation du paiement
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3_000));
      const r = await publicClient.getTransactionReceipt({ hash: feeTxHash }).catch(() => null);
      if (r) break;
    }

    // 7. Call createToken() sur LaunchpadFactory
    //    La factory déploie un clone BondingCurve, crée l'OMToken,
    //    et exécute le first buy si firstBuyUsdc > 0.
    toast.info("Sending transaction to Arc…");
    const txHash = await walletClient.writeContract({
      address:  ARC_FACTORY_ADDRESS,
      abi:      FACTORY_ABI,
      functionName: "createToken",
      args: [
        data.name,
        data.ticker,
        "",           // imageUri — vide pour l'instant (logo stocké sur notre CDN)
        data.description || "",
        firstBuyUsdcRaw,
      ],
      gasPrice: BigInt("20000000000"), // 20 gwei minimum sur Arc
    });

    toast.success(`Tx envoyée : ${txHash.slice(0, 10)}…`, { duration: 10000 });
    toast.info("Waiting for confirmation…");

    let receipt = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((r) => setTimeout(r, 3_000));
      receipt = await publicClient.getTransactionReceipt({ hash: txHash }).catch(() => null);
      if (receipt) break;
    }
    if (!receipt) throw new Error("Transaction not confirmed after 3 minutes. Check ArcScan.");

    // 6. Extraire curve + token depuis l'event TokenCreated
    const logs = parseEventLogs({
      abi:       FACTORY_ABI,
      eventName: "TokenCreated",
      logs:      receipt.logs,
    });
    // curveAddress = adresse du clone BondingCurve = nouvel arc_launch_id
    const curveAddress        = (logs[0]?.args?.curve ?? "") as string;
    const arcTokenAddress     = (logs[0]?.args?.token ?? "") as string;
    const arcCreationBlock    = receipt.blockNumber ? Number(receipt.blockNumber) : null;

    // 7. Sauvegarder les métadonnées en base
    const form = new FormData();
    if (data.logo_file) form.append("logo", data.logo_file);
    form.append("payload", JSON.stringify({
      name: data.name, ticker: data.ticker, category: data.category,
      description: data.description, website: data.website,
      twitter: data.twitter, telegram: data.telegram,
      discord: data.discord, other_social: data.other_social,
      supply: 1_000_000_000, // fixe — OMToken mint toujours 1B
      chain: "arc",
      arc_token_address: arcTokenAddress,
      arc_launch_id: curveAddress,        // adresse du clone BondingCurve (0x...)
      arc_tx_hash: txHash,
      arc_creation_block: arcCreationBlock, // bloc de création pour arc-trades
      creator_wallet: account,
      creator_fee_pct: 1,
      fee_recipients: [],
      share_top100: false, share_top100_pct: 0,
      first_buy_enabled: false, first_buy_amount: 0,
      is_scheduled: false, scheduled_at: null,
    }));

    const res = await fetch("/api/launchpad/create", { method: "POST", body: form });
    const json = await res.json() as { id?: string; error?: string };
    if (!res.ok || json.error) throw new Error(json.error ?? "Failed to save token metadata");

    toast.success("Token deployed on Arc! Redirecting…");
    router.push(`/launchpad/${json.id}`);
  }

  async function submit() {
    setSubmitting(true);
    try {
      if (chain === "arc") {
        await submitArc();
      } else {
        await submitSolana();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unexpected error");
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  // Pour Arc : 4 étapes — Identity, Socials, Options, Review
  const arcSteps = ["Identity", "Socials", "Options", "Review"];
  const effectiveSteps = chain === "arc" ? arcSteps : STEPS;
  const maxStep = effectiveSteps.length - 1;

  // Résoudre l'index réel pour les composants Solana partagés
  // Arc step 0 = Identity, 1 = Socials, 2 = ArcOptions (nouveau), 3 = Review (= solana step 3)
  const solanaStep = chain === "arc" && step === 3 ? 3 : step;

  if (chain === "solana" && (!walletAddress || selectedChain !== "solana")) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center space-y-3">
        <p className="text-sm font-semibold text-foreground">
          {walletAddress ? "Solana wallet required" : "Connect your wallet to launch a token"}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {walletAddress
            ? "Connect a Solana wallet (Phantom, Solflare…) to deploy on Solana."
            : "You need a Solana wallet to create and sign the transaction."}
        </p>
        {walletAddress && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          >
            Switch wallet
          </button>
        )}
      </div>
    );
  }

  if (chain === "arc" && selectedChain !== "arc") {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center space-y-3">
        <p className="text-sm font-semibold text-foreground">Arc wallet required</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Deploying on Arc requires an EVM wallet.<br />
          {walletAddress
            ? "Connect an EVM wallet (MetaMask, Rabby…) to deploy on Arc."
            : "Connect an EVM wallet to deploy on Arc."}
        </p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 px-4 py-2 text-xs font-semibold text-indigo-400 hover:bg-indigo-500/20 transition-colors"
        >
          Switch wallet
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <StepBar current={step} steps={effectiveSteps} />

      <div className="min-h-[400px]">
        {solanaStep === 0 && <StepIdentity   data={data} set={set} errors={errors} />}
        {solanaStep === 1 && <StepSocials    data={data} set={set} errors={errors} />}
        {chain === "arc"  && step === 2 && <StepArcOptions data={data} set={set} errors={errors} />}
        {chain !== "arc"  && solanaStep === 2 && <StepAdvanced data={data} set={set} errors={errors} />}
        {solanaStep === 3 && <StepReview     data={data} chain={chain} />}
      </div>

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
        {step > 0 ? (
          <button type="button" onClick={back}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="size-4" /> Back
          </button>
        ) : <div />}

        {step < maxStep ? (
          <button type="button" onClick={next}
            className="flex items-center gap-1.5 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
            Continue <ChevronRight className="size-4" />
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={submitting}
            className="flex items-center gap-1.5 rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
            {submitting
              ? chain === "arc" ? "Deploying on Arc…" : "Creating…"
              : chain === "arc" ? "🚀 Deploy on Arc" : "🚀 Launch Token"}
          </button>
        )}
      </div>
    </div>
  );
}

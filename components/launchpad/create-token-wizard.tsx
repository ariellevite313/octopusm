"use client";

import { SolanaMark } from "@/components/shared/solana-mark";
import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronRight, ChevronLeft, Upload, X, Plus, Trash2,
  Globe, Twitter, MessageCircle, Hash, ExternalLink, TrendingUp,
  ImageIcon, Link as LinkIcon, User, Users, SlidersHorizontal, Delete,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT, Tr } from "@/lib/i18n";
import { T, LOCALES } from "@/lib/i18n-mark";
import { createWalletClient, createPublicClient, custom, http, parseEventLogs } from "viem";
import { arc } from "@/lib/arc-chain";
import {
  ARC_FACTORY_V2_ADDRESS,
  LAUNCHPAD_FACTORY_V2_ABI,
  ARC_TREASURY_ADDRESS,
  quoteArcBuy,
  BC_VIRTUAL_USDC,
  BC_CURVE_SUPPLY,
  BC_K,
  ARC_FEE_TIERS,
} from "@/lib/arc-launchpad";
import { XSTOCK_CATALOG_SOLANA } from "@/lib/solana/xstocks";
import { XStockIcon } from "@/components/shared/xstock-icon";
import { LaunchButton } from "@/components/launchpad/launch-button";

// ─── xStock catalogue Arc (ERC-20 sur Arc Mainnet) ───────────────────────────
const XSTOCK_CATALOG = [
  { symbol: "xNVDA", name: "Nvidia",        ticker: "NVDA", emoji: "" },
  { symbol: "xTSLA", name: "Tesla",         ticker: "TSLA", emoji: "" },
  { symbol: "xMSTR", name: "MicroStrategy", ticker: "MSTR", emoji: "" },
  { symbol: "xAAPL", name: "Apple",         ticker: "AAPL", emoji: "" },
  { symbol: "xSPY",  name: "S&P 500 ETF",  ticker: "SPY",  emoji: "" },
  { symbol: "xQQQ",  name: "Nasdaq 100",   ticker: "QQQ",  emoji: "" },
  { symbol: "xGLD",  name: "Gold",          ticker: "GLD",  emoji: "" },
] as const;

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
  arc_supply: number;
  arc_first_buy_enabled: boolean;
  arc_first_buy_usdc: number;
  arc_fee_tier: 0 | 1 | 2 | 3;
  // Stock-paired (Solana)
  sol_token_type: "sol" | "stock";
  sol_stock_symbol: string;      // ex: "xNVDA"
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
  arc_fee_tier: 0,
  sol_token_type: "sol",
  sol_stock_symbol: "xNVDA",
};

const CATEGORIES = [T("Meme"), T("Utility"), T("AI"), T("Gaming"), T("DeFi"), T("NFT"), "x402"];

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

// ─── UI primitives ──────────────────────────────────────────────────────────

const FIELD = "w-full rounded-2xl bg-muted px-4 py-3.5 text-[15px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-foreground/15";

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <p className="mb-2 flex items-baseline gap-1.5 text-[15px] font-semibold text-foreground">
      {children}
      {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
    </p>
  );
}

function Err({ msg }: { msg?: string }) {
  const { tr } = useT();
  return msg ? <p className="mt-1.5 text-xs text-red-500">{tr(msg)}</p> : null;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? "bg-up" : "bg-muted-foreground/30"}`}
    >
      <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function ExpandRow({ icon, title, hint, open, onToggle, children }: {
  icon: React.ReactNode; title: string; hint?: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-muted">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background text-foreground">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-foreground">{title}</span>
          {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
        </span>
        <ChevronRight className={`size-5 shrink-0 text-foreground transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </div>
  );
}

function SocialInput({ icon, value, onChange, placeholder, error }: {
  icon: React.ReactNode; value: string; onChange: (v: string) => void; placeholder: string; error?: string;
}) {
  return (
    <div>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="w-full rounded-xl bg-background py-3 pl-11 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-foreground/15" />
      </div>
      <Err msg={error} />
    </div>
  );
}

// ─── Écran 1 — Le coin ───────────────────────────────────────────────────────

type Pair = "sol" | "usdc" | "stock";

function CoinForm({ data, set, errors, chain, onChainChange, openSocials, setOpenSocials, openMore, setOpenMore }: {
  data: WizardData;
  set: (k: keyof WizardData, v: unknown) => void;
  errors: Record<string, string>;
  chain: "solana" | "arc";
  onChainChange?: (c: "solana" | "arc") => void;
  openSocials: boolean; setOpenSocials: (v: boolean) => void;
  openMore: boolean; setOpenMore: (v: boolean) => void;
}) {
  const logoRef = useRef<HTMLInputElement>(null);
  const pdfRef  = useRef<HTMLInputElement>(null);
  const { t, tr } = useT();
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<{ name?: boolean; ticker?: boolean }>({});
  const [share, setShare] = useState(data.fee_recipients.length > 0);

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
    if (!VALID_LOGO_TYPES.includes(file.type)) { toast.error(t.unsupportedFormat); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error(t.logoMaxSize); return; }
    if (data.logo_preview) URL.revokeObjectURL(data.logo_preview);
    set("logo_file", file);
    set("logo_preview", URL.createObjectURL(file));
  }

  function handlePdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast.error(t.pdfMaxSize); return; }
    set("whitepaper_file", file);
  }

  function addRecipient() {
    if (data.fee_recipients.length >= 4) return;
    set("fee_recipients", [...data.fee_recipients, { address: "", share_pct: 0 }]);
  }
  function updateRecipient(i: number, field: keyof FeeRecipient, val: string | number) {
    set("fee_recipients", data.fee_recipients.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }
  function removeRecipient(i: number) {
    set("fee_recipients", data.fee_recipients.filter((_, idx) => idx !== i));
  }

  const pair: Pair = chain === "arc" ? "usdc" : data.sol_token_type === "stock" ? "stock" : "sol";
  function pickPair(p: Pair) {
    if (p === "usdc") { onChainChange?.("arc"); return; }
    onChainChange?.("solana");
    set("sol_token_type", p === "stock" ? "stock" : "sol");
  }
  const PAIRS: { key: Pair; label: string; icon: React.ReactNode }[] = [
    { key: "sol",   label: "SOL",   icon: <SolanaMark className="size-9 text-foreground" /> },
    { key: "usdc",  label: "USDC",  icon: <Image src="/usdc-coin.png" alt="" width={36} height={36} className="rounded-full" unoptimized /> },
    { key: "stock", label: tr("Stock"), icon: <span className="flex size-9 items-center justify-center rounded-full bg-background"><TrendingUp className="size-5 text-up" /></span> },
  ];

  return (
    <div className="space-y-6">

      {/* Média */}
      <div>
        <Label>{tr("Media")}</Label>
        <button
          type="button"
          onClick={() => logoRef.current?.click()}
          className="relative flex h-40 w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30"
        >
          {data.logo_preview ? (
            <Image src={data.logo_preview} alt={tr("Logo")} fill className="object-contain p-2" unoptimized />
          ) : (
            <>
              <ImageIcon className="size-9 text-foreground" />
              <span className="text-sm">{tr("Upload an image · PNG, JPG, GIF · 5 MB max")}</span>
            </>
          )}
        </button>
        {data.logo_file && (
          <button type="button" onClick={() => { if (data.logo_preview) URL.revokeObjectURL(data.logo_preview); set("logo_file", null); set("logo_preview", null); }}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="size-3" /> {tr("Remove")}
          </button>
        )}
        <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleLogo} />
        <Err msg={errors.logo} />
      </div>

      {/* Nom */}
      <div>
        <Label>{tr("Name")}</Label>
        <input
          value={data.name}
          onChange={(e) => { set("name", e.target.value); setAvailability({}); }}
          onBlur={checkAvailability}
          placeholder={tr("Enter the coin name")}
          className={FIELD}
        />
        {availability.name === true && <p className="mt-1.5 text-xs text-up">{tr("✓ Available")}</p>}
        {availability.name === false && <p className="mt-1.5 text-xs text-red-500">{tr("✗ Already taken")}</p>}
        <Err msg={errors.name} />
      </div>

      {/* Ticker */}
      <div>
        <Label>{tr("Ticker")}</Label>
        <input
          value={data.ticker}
          onChange={(e) => { set("ticker", e.target.value.toUpperCase().slice(0, 10)); setAvailability({}); }}
          onBlur={checkAvailability}
          placeholder={tr("Add a ticker (e.g. DOGE)")}
          className={`${FIELD} uppercase placeholder:normal-case`}
        />
        {availability.ticker === true && <p className="mt-1.5 text-xs text-up">{tr("✓ Available")}</p>}
        {availability.ticker === false && <p className="mt-1.5 text-xs text-red-500">{tr("✗ Already taken")}</p>}
        {checking && <p className="mt-1.5 text-xs text-muted-foreground">{tr("Checking…")}</p>}
        <Err msg={errors.ticker} />
      </div>

      {/* Description */}
      <div>
        <Label>{tr("Description")}</Label>
        <textarea
          value={data.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder={tr("Enter the coin description")}
          rows={3}
          maxLength={500}
          className={`${FIELD} resize-none`}
        />
        <Err msg={errors.description} />
      </div>

      {/* Catégorie */}
      <div>
        <Label>{tr("Category")}</Label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => set("category", cat)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                data.category === cat ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {tr(cat)}
            </button>
          ))}
        </div>
      </div>

      {/* Paire de pool */}
      <div>
        <Label>{tr("Pool pair")}</Label>
        <div className="grid grid-cols-3 gap-2.5">
          {PAIRS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => pickPair(p.key)}
              aria-pressed={pair === p.key}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 bg-muted px-2 py-4 transition-colors ${
                pair === p.key ? "border-up" : "border-transparent hover:border-border"
              }`}
            >
              {p.icon}
              <span className="text-[15px] font-bold text-foreground">{p.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {pair === "usdc" ? tr("Launches on Arc, traded in USDC.") : pair === "stock" ? tr("Launches on Solana, paired with a tokenized stock.") : tr("Launches on Solana, traded in SOL.")}
        </p>

        {pair === "stock" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {XSTOCK_CATALOG_SOLANA.map((s) => (
              <button
                key={s.symbol}
                type="button"
                onClick={() => set("sol_stock_symbol", s.symbol)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  data.sol_stock_symbol === s.symbol ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <XStockIcon symbol={s.symbol} size={14} />
                <span>${s.ticker}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Liens sociaux */}
      <ExpandRow icon={<LinkIcon className="size-5" />} title={tr("Social links")} hint={tr("Optional")} open={openSocials} onToggle={() => setOpenSocials(!openSocials)}>
        <SocialInput icon={<Globe className="size-4" />}         value={data.website}      onChange={(v) => set("website", v)}      placeholder={tr("Website · https://yourtoken.com")} error={errors.website} />
        <SocialInput icon={<Twitter className="size-4" />}       value={data.twitter}      onChange={(v) => set("twitter", v)}      placeholder={tr("X · https://x.com/yourtoken")} error={errors.twitter} />
        <SocialInput icon={<MessageCircle className="size-4" />} value={data.telegram}     onChange={(v) => set("telegram", v)}     placeholder={tr("Telegram · https://t.me/yourtoken")} error={errors.telegram} />
        <SocialInput icon={<Hash className="size-4" />}          value={data.discord}      onChange={(v) => set("discord", v)}      placeholder={tr("Discord · https://discord.gg/yourtoken")} error={errors.discord} />
        <SocialInput icon={<ExternalLink className="size-4" />}  value={data.other_social} onChange={(v) => set("other_social", v)} placeholder={tr("Other · https://…")} error={errors.other_social} />
      </ExpandRow>

      {/* Récompenses créateur */}
      {chain === "arc" ? (
        <div>
          <Label>{tr("Fees & rewards")}</Label>
          <FeeTierCard tier={data.arc_fee_tier} setTier={(tier) => set("arc_fee_tier", tier)} />
        </div>
      ) : (
        <div>
          <Label>{tr("Send creator rewards to:")}</Label>
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
            {[
              { on: !share, label: T("Me"), icon: <User className="size-4" />, click: () => { setShare(false); set("fee_recipients", []); } },
              { on: share,  label: T("Shared"), icon: <Users className="size-4" />, click: () => { setShare(true); if (data.fee_recipients.length === 0) addRecipient(); } },
            ].map((o) => (
              <button key={o.label} type="button" onClick={o.click}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                  o.on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>
                {o.icon}{tr(o.label)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {share ? tr("2% trading fee per trade. Split your creator fees with up to 4 wallets.") : tr("2% trading fee per trade. 100% of your creator fees go to your wallet.")}
          </p>

          {share && (
            <div className="mt-3 space-y-2">
              {data.fee_recipients.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={r.address}
                    onChange={(e) => updateRecipient(i, "address", e.target.value)}
                    placeholder={tr("Solana wallet address")}
                    className="min-w-0 flex-1 rounded-xl bg-muted px-3 py-3 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/15"
                  />
                  <div className="relative">
                    <input
                      type="number" min={1} max={99}
                      value={r.share_pct}
                      onChange={(e) => updateRecipient(i, "share_pct", Number(e.target.value))}
                      className="w-16 rounded-xl bg-muted py-3 pl-2 pr-5 text-center text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/15"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                  </div>
                  <button type="button" onClick={() => removeRecipient(i)} aria-label={tr("Remove")} className="text-muted-foreground transition-colors hover:text-red-500">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              {data.fee_recipients.length < 4 && (
                <button type="button" onClick={addRecipient} className="flex items-center gap-1 text-sm font-semibold text-foreground hover:opacity-80">
                  <Plus className="size-4" /> {tr("Add wallet")}
                </button>
              )}
              <Err msg={errors.fee_recipients} />
            </div>
          )}
        </div>
      )}

      {/* Plus d'options */}
      <ExpandRow icon={<SlidersHorizontal className="size-5" />} title={tr("More options")} hint={chain === "arc" ? tr("Whitepaper") : tr("Scheduled launch, whitepaper")} open={openMore} onToggle={() => setOpenMore(!openMore)}>
        {chain === "solana" && data.sol_token_type === "sol" && (
          <div className="rounded-xl bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{tr("Scheduled launch")}</p>
                <p className="text-xs text-muted-foreground">{tr("+0.1 SOL · not tradeable until the chosen date")}</p>
              </div>
              <Toggle on={data.is_scheduled} onClick={() => set("is_scheduled", !data.is_scheduled)} />
            </div>
            {data.is_scheduled && (
              <>
                <input
                  type="datetime-local"
                  min={tomorrowMin()}
                  max={maxSchedule()}
                  value={data.scheduled_at}
                  onChange={(e) => set("scheduled_at", e.target.value)}
                  className="mt-3 w-full rounded-xl bg-muted px-3 py-2.5 text-sm text-foreground focus:outline-none"
                />
                <Err msg={errors.scheduled_at} />
              </>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => pdfRef.current?.click()}
          className="flex w-full items-center gap-2 rounded-xl bg-background px-3 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Upload className="size-4" />
          <span className="truncate">{data.whitepaper_file ? data.whitepaper_file.name : tr("Whitepaper · PDF, 20 MB max")}</span>
          {data.whitepaper_file && (
            <X className="ml-auto size-4" onClick={(e) => { e.stopPropagation(); set("whitepaper_file", null); }} />
          )}
        </button>
        <input ref={pdfRef} type="file" accept=".pdf" className="hidden" onChange={handlePdf} />
      </ExpandRow>
    </div>
  );
}

// ─── Écran 2 — Premier achat ─────────────────────────────────────────────────

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"] as const;

function BuyScreen({ data, set, errors, chain, onBack }: {
  data: WizardData;
  set: (k: keyof WizardData, v: unknown) => void;
  errors: Record<string, string>;
  chain: "solana" | "arc";
  onBack: () => void;
}) {
  const isArc   = chain === "arc";
  const isStock = !isArc && data.sol_token_type === "stock";
  const unit    = isArc ? "USDC" : "SOL";
  const maxDec  = isArc ? 2 : 3;
  const [raw, setRaw] = useState(() => {
    if (isArc) return data.arc_first_buy_enabled ? String(data.arc_first_buy_usdc) : "0";
    return data.first_buy_enabled ? String(data.first_buy_amount) : "0";
  });
  const [showFees, setShowFees] = useState(false);

  function commit(next: string) {
    setRaw(next);
    const n = parseFloat(next);
    const ok = !isNaN(n) && n > 0;
    if (isArc) {
      set("arc_first_buy_enabled", ok);
      if (ok) set("arc_first_buy_usdc", n);
    } else {
      set("first_buy_enabled", ok);
      if (ok) set("first_buy_amount", n);
    }
  }

  function press(k: (typeof KEYS)[number]) {
    if (k === "del") { commit(raw.length <= 1 ? "0" : raw.slice(0, -1)); return; }
    if (k === ".") { if (!raw.includes(".")) commit(raw + "."); return; }
    const [, dec] = raw.split(".");
    if (dec !== undefined && dec.length >= maxDec) return;
    const next = raw === "0" ? k : raw + k;
    const n = parseFloat(next);
    if (!isArc && n > 100) return;
    if (isArc && n > 1_000_000) return;
    commit(next);
  }

  const QUICK = isArc ? [25, 50, 100] : [0.1, 0.5, 1];
  const amount = parseFloat(raw) || 0;

  // Estimation de tokens sur Arc (courbe initiale)
  let tokensEst = "";
  if (isArc && amount > 0) {
    try {
      const feeBps = BigInt(ARC_FEE_TIERS[data.arc_fee_tier].totalBps);
      const usdcWei = BigInt(Math.round(amount * 1e15)) * 1000n;
      const { tokensOut } = quoteArcBuy(BC_VIRTUAL_USDC, BC_CURVE_SUPPLY, usdcWei, feeBps, BC_K);
      const tok = Number(tokensOut / 10n ** 12n) / 1e6;
      tokensEst = tok >= 1_000_000 ? `≈ ${(tok / 1_000_000).toFixed(2)}M ${data.ticker}` : tok >= 1_000 ? `≈ ${(tok / 1_000).toFixed(1)}K ${data.ticker}` : `≈ ${tok.toFixed(0)} ${data.ticker}`;
    } catch { tokensEst = ""; }
  }

  // Coûts (mêmes montants qu'avant)
  const NETWORK_RENT = data.sol_token_type === "stock" ? 0.038 : 0.02449768;
  const mintCost = 0.05 + NETWORK_RENT + (data.is_scheduled ? 0.1 : 0);
  const total = isArc
    ? `~${(amount + 0.04).toFixed(2)} USDC`
    : `~${(mintCost + (isStock ? 0 : amount)).toFixed(3)} SOL`;
  const feeRows: [string, string][] = isArc
    ? [["Creation fee", "Free"], ["Network gas", "~0.04 USDC"], ...(amount > 0 ? [["First buy", `${amount} USDC`] as [string, string]] : [])]
    : [
        ["Platform fee", "0.05 SOL"],
        ["Network rent", `~${NETWORK_RENT.toFixed(4)} SOL`],
        ...(data.is_scheduled ? [["Scheduled launch", "0.10 SOL"] as [string, string]] : []),
        ...(!isStock && amount > 0 ? [["First buy", `${amount} SOL`] as [string, string]] : []),
        ...(isStock ? [["Signatures", "3 (fee + config + pool)"] as [string, string]] : []),
      ];

  return (
    <div className="flex flex-col">
      {/* En-tête */}
      <div className="mb-2 grid grid-cols-[40px_1fr_40px] items-center">
        <button type="button" onClick={onBack} aria-label="Back" className="flex size-10 items-center justify-center rounded-full text-foreground hover:bg-muted">
          <ChevronLeft className="size-6" />
        </button>
        <p className="truncate text-center text-[17px] font-bold text-foreground">Buy {data.ticker ? `$${data.ticker}` : "your coin"}</p>
        <span />
      </div>
      <p className="text-center text-sm text-muted-foreground">(Optional) Buy your own coin before launch.</p>

      {isStock ? (
        <p className="py-16 text-center text-sm text-muted-foreground">First buy isn&apos;t available for stock-paired coins.</p>
      ) : (
        <>
          {/* Montant */}
          <div className="flex flex-col items-center py-10">
            <p className="num flex items-baseline gap-2 text-[56px] font-bold leading-none tracking-tight">
              <span className={amount > 0 ? "text-foreground" : "text-muted-foreground"}>{raw}</span>
              <span className="text-3xl text-muted-foreground">{unit}</span>
            </p>
            {tokensEst && <p className="mt-3 text-sm text-muted-foreground">{tokensEst}</p>}
            <Err msg={errors.first_buy_amount ?? errors.arc_first_buy_usdc} />
          </div>

          {/* Raccourcis */}
          <div className="grid grid-cols-3 gap-2.5">
            {QUICK.map((q) => (
              <button key={q} type="button" onClick={() => commit(String(q))}
                className="rounded-full bg-muted py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
                {isArc ? `$${q}` : `${q} SOL`}
              </button>
            ))}
          </div>

          {/* Pavé numérique */}
          <div className="mt-2 grid grid-cols-3">
            {KEYS.map((k) => (
              <button key={k} type="button" onClick={() => press(k)} aria-label={k === "del" ? "Delete" : k}
                className="flex h-14 items-center justify-center rounded-2xl text-2xl font-semibold text-foreground transition-colors active:bg-muted md:hover:bg-muted">
                {k === "del" ? <Delete className="size-6" /> : k}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Coût */}
      <button type="button" onClick={() => setShowFees(!showFees)} className="mt-4 flex items-center justify-between py-2 text-sm">
        <span className="flex items-center gap-1 text-muted-foreground">
          Total cost <ChevronRight className={`size-4 transition-transform ${showFees ? "rotate-90" : ""}`} />
        </span>
        <span className="num font-bold text-foreground">{total}</span>
      </button>
      {showFees && (
        <div className="space-y-1.5 pb-2">
          {feeRows.map(([l, v]) => (
            <div key={l} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{l}</span>
              <span className="num font-medium text-foreground">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Fee tier accent styles (legacy — conservé pour la branche Solana) ───────

const TIER_ACCENT: Record<number, { tabSel: string; badge: string; card: string; pct: string; desc: string }> = {
  0: {
    tabSel: "border-border bg-muted/50 text-foreground",
    badge:  "bg-foreground/80 text-background",
    card:   "border-border",
    pct:    "text-foreground",
    desc:   "Simple, no holder dividends.",
  },
  1: {
    tabSel: "border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-400",
    badge:  "bg-blue-500 text-white",
    card:   "border-blue-200 dark:border-blue-800",
    pct:    "text-blue-600 dark:text-blue-400",
    desc:   "Holders earn dividends on every swap.",
  },
  2: {
    tabSel: "border-purple-300 bg-purple-50 text-purple-600 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-400",
    badge:  "bg-purple-500 text-white",
    card:   "border-purple-200 dark:border-purple-800",
    pct:    "text-purple-600 dark:text-purple-400",
    desc:   "Maximize creator revenue.",
  },
  3: {
    tabSel: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-400",
    badge:  "bg-amber-500 text-white",
    card:   "border-amber-200 dark:border-amber-800",
    pct:    "text-amber-700 dark:text-amber-400",
    desc:   "Max fees. Holders earn dividends.",
  },
};

// ─── Fee Tier Card — Arc V2 ──────────────────────────────────────────────────

const ARC_TIER_DEFS = [
  {
    index: 0 as const,
    name: "Standard",
    totalPct: 1.0,
    rows: [
      { label: "Creator",  pct: 0.50, color: "#378ADD" },
      { label: "Platform", pct: 0.25, color: "#1D9E75" },
      { label: "LP Bonus", pct: 0.25, color: "#F59E0B" },
    ],
    // Post-graduation splits of the 0.50% V4 pool fee
    postGrad: [
      { label: "Creator",    pct: 53.33, color: "#378ADD" },
      { label: "Platform",   pct: 20.00, color: "#1D9E75" },
      { label: "LP Reserve", pct: 26.67, color: "#F59E0B" },
    ],
    desc: "Simple. LP bonus boosts graduation liquidity.",
  },
  {
    index: 1 as const,
    name: "Community",
    totalPct: 1.25,
    rows: [
      { label: "Creator",  pct: 0.40, color: "#378ADD" },
      { label: "Platform", pct: 0.30, color: "#1D9E75" },
      { label: "LP Bonus", pct: 0.30, color: "#F59E0B" },
      { label: "Holders",  pct: 0.25, color: "#8B5CF6" },
    ],
    postGrad: [
      { label: "Creator",    pct: 33.69, color: "#378ADD" },
      { label: "Platform",   pct: 20.00, color: "#1D9E75" },
      { label: "LP Reserve", pct: 25.27, color: "#F59E0B" },
      { label: "Holders",    pct: 21.04, color: "#8B5CF6" },
    ],
    desc: "Holders earn dividends + LP bonus on every swap.",
  },
  {
    index: 2 as const,
    name: "Creator",
    totalPct: 1.50,
    rows: [
      { label: "Creator",  pct: 0.80, color: "#378ADD" },
      { label: "Platform", pct: 0.40, color: "#1D9E75" },
      { label: "LP Bonus", pct: 0.30, color: "#F59E0B" },
    ],
    postGrad: [
      { label: "Creator",    pct: 58.17, color: "#378ADD" },
      { label: "Platform",   pct: 20.00, color: "#1D9E75" },
      { label: "LP Reserve", pct: 21.83, color: "#F59E0B" },
    ],
    desc: "Max creator yield. LP bonus boosts graduation liquidity.",
  },
  {
    index: 3 as const,
    name: "Max",
    totalPct: 2.0,
    rows: [
      { label: "Creator",  pct: 1.00, color: "#378ADD" },
      { label: "Platform", pct: 0.50, color: "#1D9E75" },
      { label: "LP Bonus", pct: 0.30, color: "#F59E0B" },
      { label: "Holders",  pct: 0.20, color: "#8B5CF6" },
    ],
    postGrad: [
      { label: "Creator",    pct: 46.66, color: "#378ADD" },
      { label: "Platform",   pct: 30.00, color: "#1D9E75" },
      { label: "LP Reserve", pct: 14.00, color: "#F59E0B" },
      { label: "Holders",    pct:  9.34, color: "#8B5CF6" },
    ],
    desc: "Max fees. Holders earn dividends + extra LP at graduation.",
  },
];

function FeeTierCard({
  tier,
  setTier,
}: {
  tier: 0 | 1 | 2 | 3;
  setTier: (t: 0 | 1 | 2 | 3) => void;
}) {
  const def = ARC_TIER_DEFS[tier];
  const maxPct = Math.max(...def.rows.map((r) => r.pct));

  return (
    <div className="space-y-4 rounded-2xl bg-muted p-4">
      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1.5">
        {ARC_TIER_DEFS.map((t) => (
          <button
            key={t.index}
            type="button"
            onClick={() => setTier(t.index)}
            className={`rounded-lg border py-1.5 text-[11px] font-medium transition-colors ${
              tier === t.index ? "border-foreground bg-background text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="block">{t.name}</span>
            <span className="block font-semibold">{t.totalPct}%</span>
          </button>
        ))}
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground">{def.desc}</p>

      {/* Barres */}
      <div className="space-y-2.5">
        <p className="text-[13px] text-muted-foreground">During bonding curve</p>
        {def.rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-16 shrink-0">{r.label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${(r.pct / maxPct) * 100}%`, background: r.color }}
              />
            </div>
            <span className="text-xs font-medium text-foreground w-10 text-right">{r.pct.toFixed(2)}%</span>
          </div>
        ))}
      </div>

      {/* Post-graduation */}
      <div className="pt-3 border-t border-border space-y-2.5">
        <p className="text-[13px] text-muted-foreground">
          After graduation — 0.50% V4 pool fee split
        </p>
        {/* Barres post-grad */}
        {(() => {
          const maxPostPct = Math.max(...def.postGrad.map((r) => r.pct));
          return (
            <div className="space-y-2">
              {def.postGrad.map((r) => (
                <div key={r.label} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{r.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${(r.pct / maxPostPct) * 100}%`, background: r.color }}
                    />
                  </div>
                  <span className="text-xs font-medium text-foreground w-12 text-right">
                    {r.pct % 1 === 0 ? r.pct.toFixed(0) : r.pct.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          );
        })()}
        <p className="text-[11px] text-muted-foreground">
          Graduation at ~2 000 USDC raised → Uniswap V4 pool · indexed on DexScreener
        </p>
      </div>
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

function validateScreen(screen: number, data: WizardData): Record<string, string> {
  if (screen === 0) {
    const e = { ...validate(0, data), ...validate(1, data), ...validate(2, data) };
    delete e.first_buy_amount;
    return e;
  }
  const e: Record<string, string> = {};
  if (data.first_buy_enabled && data.sol_token_type === "sol" && data.first_buy_amount < 0.01) e.first_buy_amount = "Minimum first buy is 0.01 SOL";
  if (data.arc_first_buy_enabled && data.arc_first_buy_usdc < 0.01) e.arc_first_buy_usdc = "Minimum first buy is 0.01 USDC";
  return e;
}

// ─── Wizard principal ────────────────────────────────────────────────────────

type InitialData = Partial<Pick<WizardData,
  "name" | "ticker" | "category" | "description" |
  "website" | "twitter" | "telegram" | "discord" | "other_social"
>>;

export function CreateTokenWizard({
  initialData,
  chain = "solana",
  onChainChange,
}: {
  initialData?: InitialData;
  chain?: "solana" | "arc";
  onChainChange?: (c: "solana" | "arc") => void;
}) {
  const router = useRouter();
  const { walletAddress, walletType, selectedChain } = useAuth();
  const { t } = useT();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(() => ({ ...INITIAL, ...initialData }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [openSocials, setOpenSocials] = useState(false);
  const [openMore, setOpenMore] = useState(false);
  const [launchId, setLaunchId] = useState<string | null>(null);

  // Réinitialiser le step quand on change de chaîne
  useEffect(() => { setStep(0); setErrors({}); }, [chain]);

  function set(k: keyof WizardData, v: unknown) {
    setData((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => { const e = { ...prev }; delete e[k as string]; return e; });
  }

  function next() {
    const errs = validateScreen(0, data);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      if (["website", "twitter", "telegram", "discord", "other_social"].some((k) => errs[k])) setOpenSocials(true);
      if (errs.scheduled_at) setOpenMore(true);
      toast.error(Object.values(errs)[0]);
      return;
    }
    setErrors({});
    setStep(1);
    window.scrollTo({ top: 0 });
  }

  function back() { setStep((s) => s - 1); }

  async function submitSolana() {
    if (!walletAddress) { toast.error(t.connectWalletFirst); return; }
    // Guard : MetaMask est un wallet EVM — ne peut pas signer de TX Solana
    if (walletType === "metamask") {
      toast.error(t.metamaskNoSolana);
      return;
    }
    // Guard : l'adresse doit ressembler à une clé publique Solana (base58, pas 0x)
    if (walletAddress.startsWith("0x") || walletAddress.length < 32 || walletAddress.length > 44) {
      toast.error(t.invalidSolanaAddress);
      return;
    }
    const form = new FormData();
    if (data.logo_file) form.append("logo", data.logo_file);
    if (data.whitepaper_file) form.append("whitepaper", data.whitepaper_file);
    const isStockPaired = data.sol_token_type === "stock";
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
      // Stock-Paired (Solana via Meteora DBC)
      ...(isStockPaired ? {
        stock_symbol: data.sol_stock_symbol,
        // quote_asset is the SPL mint of the xStock — stored for reference
        // the DBC config key (with that mint as quoteMint) is used server-side
      } : {}),
    }));

    const res = await fetch("/api/launchpad/create", { method: "POST", body: form });
    const json = await res.json() as { id?: string; error?: string };
    if (!res.ok || json.error) throw new Error(json.error ?? "Failed to create token");
    // On reste dans l'assistant : les signatures se font tout de suite (pas de page "Pending")
    setLaunchId(json.id ?? null);
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
      toast.error(t.arcRequiresMetamask, { duration: 8000 });
      return;
    }

    if (!eth.isMetaMask) {
      toast.error(t.arcRequiresMetamaskInstall);
      return;
    }

    // 1. Request account
    const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
    const account = accounts[0] as `0x${string}`;

    // 2. Switch to Arc Mainnet if needed (chainId lowercase = MetaMask requirement)
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x13b2" }], // 5042 — lowercase required by MetaMask
      });
    } catch (switchErr: unknown) {
      // 4902 = chaîne inconnue → on l'ajoute
      // 4001 = rejet utilisateur → on propage
      if ((switchErr as { code?: number })?.code === 4001) {
        throw new Error("Network switch rejected by user");
      }
      try {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0x13b2",  // lowercase hex — MetaMask is case-sensitive
            chainName: "Arc",
            nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
            rpcUrls: ["https://rpc.mainnet.arc.io"],
            blockExplorerUrls: ["https://explorer.arc.io"],
          }],
        });
      } catch (addErr: unknown) {
        const msg = (addErr as { message?: string })?.message ?? String(addErr);
        throw new Error(`Failed to add Arc to MetaMask: ${msg}. Add manually: chainId 5042, RPC https://rpc.mainnet.arc.io`);
      }
    }

    // 3. Create viem clients
    const walletClient = createWalletClient({
      account,
      chain: arc,
      transport: custom(eth),
    });
    const publicClient = createPublicClient({
      chain: arc,
      transport: http("/api/arc-rpc"),
    });

    // ── LaunchpadFactoryArcV2 ─────────────────────────────────────────────────
      if (!ARC_FACTORY_V2_ADDRESS) throw new Error("Contrats V2 pas encore déployés. Lance d'abord forge script DeployArcV2.s.sol.");

      const firstBuyUsdc = data.arc_first_buy_enabled ? BigInt(Math.round(data.arc_first_buy_usdc * 1e18)) : 0n;
      const totalValue   = firstBuyUsdc;

      toast.info(t.deployingArcV2);
      const txHash = await walletClient.writeContract({
        address:      ARC_FACTORY_V2_ADDRESS,
        abi:          LAUNCHPAD_FACTORY_V2_ABI,
        functionName: "createToken",
        args: [
          data.name,
          data.ticker,
          "",               // imageUri (stocké off-chain)
          data.description,
          firstBuyUsdc,
          data.arc_fee_tier,
        ],
        value: totalValue,
      });

      toast.success(t.txSent(txHash.slice(0, 10)), { duration: 10000 });
      toast.info(t.waitingConfirmation);

      let receipt = null;
      for (let attempt = 0; attempt < 100; attempt++) {
        await new Promise(r => setTimeout(r, 3_000));
        receipt = await publicClient.getTransactionReceipt({ hash: txHash }).catch(() => null);
        if (receipt) break;
      }
      if (!receipt) throw new Error("Transaction non confirmée après 5 min. Vérifie ArcScan : https://explorer.arc.io/tx/" + txHash);
      if (receipt.status === "reverted") {
        throw new Error("Transaction revertée — vérifie ArcScan : https://explorer.arc.io/tx/" + txHash);
      }

      // Extraire curve, token, vault depuis l'event TokenLaunched
      const logs = parseEventLogs({
        abi:       LAUNCHPAD_FACTORY_V2_ABI,
        eventName: "TokenLaunched",
        logs:      receipt.logs,
      });
      if (!logs[0]?.args?.token || !logs[0]?.args?.curve) {
        throw new Error("Factory V2 n'a pas émis TokenLaunched. Vérifie ARC_FACTORY_V2_ADDRESS.");
      }
      const arcTokenAddress  = logs[0].args.token as string;
      const arcCurveAddress  = logs[0].args.curve as string;
      const arcVaultAddress  = (logs[0].args as Record<string, unknown>).vault as string | null ?? null;
      const arcCreationBlock = receipt.blockNumber ? Number(receipt.blockNumber) : null;

      // Sauvegarder — V2 : arc_launch_id = curve address (≠ token)
      const form = new FormData();
      if (data.logo_file)       form.append("logo",       data.logo_file);
      if (data.whitepaper_file) form.append("whitepaper", data.whitepaper_file);
      form.append("payload", JSON.stringify({
        name: data.name, ticker: data.ticker, category: data.category,
        description: data.description, website: data.website,
        twitter: data.twitter, telegram: data.telegram,
        discord: data.discord, other_social: data.other_social,
        supply: 1_000_000_000,
        chain: "arc",
        arc_token_address: arcTokenAddress,
        arc_launch_id:     arcCurveAddress, // ← V2 : launch_id = curve address
        arc_tx_hash:       txHash,
        arc_creation_block: arcCreationBlock,
        quote_asset:   null,
        stock_symbol:  null,
        creator_wallet: account,
        creator_fee_pct: 1,
        fee_recipients: [],
        share_top100: false, share_top100_pct: 0,
        first_buy_enabled: data.arc_first_buy_enabled,
        first_buy_amount: data.arc_first_buy_usdc,
        arc_fee_tier: data.arc_fee_tier,
        is_scheduled: false, scheduled_at: null,
        vault_address: arcVaultAddress,
        fee_distributor_address: null,
        holder_rewards: false,
      }));
      const res = await fetch("/api/launchpad/create", { method: "POST", body: form });
      const json = await res.json() as { id?: string; error?: string };
      if (!res.ok || json.error) {
        const errMsg = json.error ?? `HTTP ${res.status}`;
        console.error("[Arc wizard] DB save failed:", errMsg, "token:", arcTokenAddress, "curve:", arcCurveAddress, "tx:", txHash);
        throw new Error(`Token deployed on-chain (curve: ${arcCurveAddress}) but DB save failed: ${errMsg}. Save the token address!`);
      }
      toast.success(t.tokenDeployedArc);
      router.push(`/launchpad/${json.id}`);
  }

  async function submit() {
    const errs = validateScreen(1, data);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
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

  // Wallet requis selon la chaîne (affiché à la place du bouton Créer)
  const walletIssue =
    chain === "solana" && (!walletAddress || selectedChain !== "solana")
      ? (walletAddress ? "Connect a Solana wallet (Phantom, Solflare…) to launch on Solana." : "Connect your wallet to launch a coin.")
      : chain === "arc" && selectedChain !== "arc"
      ? "Connect an EVM wallet (MetaMask, Rabby…) to launch on Arc."
      : null;

  return (
    <div className="pb-4">
      {/* Signatures du lancement Solana, directement dans l'assistant */}
      {launchId && walletAddress && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 md:items-center">
          <div className="w-full max-w-md rounded-t-[28px] bg-card px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-5 md:rounded-[28px]">
            <div className="mb-4 flex items-center gap-3">
              {data.logo_preview && (
                <Image src={data.logo_preview} alt="" width={48} height={48} className="size-12 rounded-full object-cover" unoptimized />
              )}
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-foreground">Launch ${data.ticker}</p>
                <p className="text-sm text-muted-foreground">Approve the signatures in your wallet. Keep this window open.</p>
              </div>
            </div>
            <LaunchButton tokenId={launchId} walletAddress={walletAddress} isScheduled={data.is_scheduled} autoStart />
            <button
              type="button"
              onClick={() => router.push("/dashboard/launchpad")}
              className="mt-4 w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Finish later from My tokens
            </button>
          </div>
        </div>
      )}

      {step === 0 ? (
        <>
        <div className="mb-6 grid grid-cols-[40px_1fr_40px] items-center">
          <Link href="/" aria-label="Back" className="flex size-10 items-center justify-center rounded-full text-foreground hover:bg-muted">
            <ChevronLeft className="size-6" />
          </Link>
          <h1 className="text-center text-[17px] font-bold text-foreground">Create a coin</h1>
          <span />
        </div>
        <CoinForm
          data={data} set={set} errors={errors} chain={chain} onChainChange={onChainChange}
          openSocials={openSocials} setOpenSocials={setOpenSocials}
          openMore={openMore} setOpenMore={setOpenMore}
        />
        </>
      ) : (
        <BuyScreen data={data} set={set} errors={errors} chain={chain} onBack={() => setStep(0)} />
      )}

      {/* Action */}
      <div className="sticky bottom-24 z-10 mt-6 md:bottom-4">
        {step === 0 ? (
          <button type="button" onClick={next}
            className="w-full rounded-2xl bg-primary py-4 text-base font-bold text-white shadow-lg transition-opacity hover:opacity-90">
            Next
          </button>
        ) : walletIssue ? (
          <div className="rounded-2xl bg-muted p-4 text-center">
            <p className="text-sm text-foreground">{walletIssue}</p>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))}
              className="mt-3 rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background">
              {walletAddress ? "Switch wallet" : "Connect wallet"}
            </button>
          </div>
        ) : (
          <button type="button" onClick={submit} disabled={submitting}
            className="w-full rounded-2xl bg-primary py-4 text-base font-bold text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50">
            {submitting
              ? chain === "arc" ? "Deploying on Arc…" : "Creating…"
              : `Create ${data.ticker ? `$${data.ticker}` : "coin"}`}
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">Coin data can&apos;t be changed after creation.</p>
      {step === 1 && chain === "arc" && (
        <p className="mt-1 text-center text-xs text-muted-foreground">
          MetaMask opens to sign on Arc. In Phantom, set the default wallet to “Always ask”.
        </p>
      )}
    </div>
  );
}

"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Check, Share2, X, Plus } from "lucide-react";
import { SwapKeypad } from "@/components/launchpad/swap-keypad";
import { useAuth } from "@/providers/auth-provider";
import { connectWalletAndAuth } from "@/lib/wallet/auth";
import { getAvailableWallets } from "@/lib/wallet/adapters";
import { WalletSelectDialog } from "@/components/wallet/wallet-select-dialog";
import { MarketCountdownBadge } from "@/components/market/market-countdown";
import {
  parseMarketOptions,
  type MarketOption,
} from "@/lib/market/utils";
import {
  submitBet,
  computeReward,
  MIN_STAKE_USDC,
  MAX_STAKE_USDC,
  MIN_STAKE_CLT,
} from "@/lib/market/betting";
import type { PredictionMarketRow, MarketCommentEnriched } from "@/lib/supabase/types";
import type { WalletType } from "@/lib/wallet/adapters";
import type { MarketVolumeDetail } from "@/services/prediction-service";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";
import dynamic from "next/dynamic";
import { CommentsSection } from "@/components/shared/comments-section";
import { ShareSheet } from "@/components/shared/share-sheet";
import { useT } from "@/lib/i18n";
import { T, LOCALES } from "@/lib/i18n-mark";

const CryptoPriceChart = dynamic(
  () => import("@/components/prediction/crypto-price-chart").then(m => m.CryptoPriceChart),
  { ssr: false }
);

// ─── Option Colors ────────────────────────────────────────────────────────────────────

const OPTION_COLORS = [
  { bar: "bg-blue-500",   border: "border-blue-500",   bg: "bg-blue-500",   text: "text-white", probText: "text-blue-100",   volText: "text-blue-200",   barBg: "bg-blue-400/40",   barFill: "bg-white/70", idle: "border-blue-200 bg-card hover:border-blue-300 hover:bg-blue-50 dark:border-blue-900/40 dark:hover:border-blue-700/60 dark:hover:bg-zinc-800" },
  { bar: "bg-red-500",    border: "border-red-500",    bg: "bg-red-500",    text: "text-white", probText: "text-red-100",    volText: "text-red-200",    barBg: "bg-red-400/40",    barFill: "bg-white/70", idle: "border-red-200 bg-card hover:border-red-300 hover:bg-red-50 dark:border-red-900/40 dark:hover:border-red-700/60 dark:hover:bg-zinc-800" },
  { bar: "bg-green-500",  border: "border-green-500",  bg: "bg-green-500",  text: "text-white", probText: "text-green-100",  volText: "text-green-200",  barBg: "bg-green-400/40",  barFill: "bg-white/70", idle: "border-green-200 bg-card hover:border-green-300 hover:bg-green-50 dark:border-green-900/40 dark:hover:border-green-700/60 dark:hover:bg-zinc-800" },
  { bar: "bg-orange-500", border: "border-orange-500", bg: "bg-orange-500", text: "text-white", probText: "text-white/85", volText: "text-white/70", barBg: "bg-orange-400/40", barFill: "bg-white/70", idle: "border-border bg-card hover:border-orange-300 hover:bg-orange-50 dark:hover:border-orange-700/60 dark:hover:bg-zinc-800" },
  { bar: "bg-purple-500", border: "border-purple-500", bg: "bg-purple-500", text: "text-white", probText: "text-purple-100", volText: "text-purple-200", barBg: "bg-purple-400/40", barFill: "bg-white/70", idle: "border-purple-200 bg-card hover:border-purple-300 hover:bg-purple-50 dark:border-purple-900/40 dark:hover:border-purple-700/60 dark:hover:bg-zinc-800" },
  { bar: "bg-yellow-500", border: "border-yellow-500", bg: "bg-yellow-500", text: "text-white", probText: "text-yellow-100", volText: "text-yellow-200", barBg: "bg-yellow-400/40", barFill: "bg-white/70", idle: "border-yellow-200 bg-card hover:border-yellow-300 hover:bg-yellow-50 dark:border-yellow-900/40 dark:hover:border-yellow-700/60 dark:hover:bg-zinc-800" },
];
function optionColor(index: number, label?: string) {
  const l = label?.trim().toLowerCase();
  if (l === "yes") return OPTION_COLORS[2]; // green
  if (l === "no")  return OPTION_COLORS[1]; // red
  return OPTION_COLORS[index % OPTION_COLORS.length];
}

// ─── Types ────────────────────────────────────────────────────────────────────────────

type BetToken = "usdc" | "clawdtrust";
type SubmitState = "idle" | "signing" | "submitting" | "success" | "error";

// ─── Quick-pick amounts ───────────────────────────────────────────────────────────

const QUICK_USDC = [5, 10, 25, 50];
const QUICK_CLT  = [500_000, 1_000_000, 2_000_000];

function formatCLT(n: number) {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1_000)     return `${n / 1_000}K`;
  return String(n);
}

function fmtVol(usdc: number, clt: number, locale = "en-US") {
  const parts: string[] = [];
  if (usdc > 0) parts.push(`$${usdc.toLocaleString(locale, { maximumFractionDigits: 0 })} USDC`);
  if (clt > 0)  parts.push(`${(clt / 1_000_000).toFixed(1)}M CLT`);
  return parts.join(" · ") || "—";
}

// ─── Market status ───────────────────────────────────────────────────────────────

type MarketStatus = "open" | "live" | "resolved" | "closed";

function getMarketStatus(market: PredictionMarketRow): MarketStatus {
  if (market.is_resolved) return "resolved";
  if (!market.is_active)  return "closed";
  if (market.event_start_at && new Date(market.event_start_at) <= new Date()) return "live";
  return "open";
}

const STATUS_STYLES: Record<MarketStatus, { label: string; cls: string; dot?: boolean }> = {
  open:     { label: T("Open"),     cls: "border-transparent bg-up/12 text-up", dot: false },
  live:     { label: T("Live"),     cls: "border-transparent bg-up/12 text-up", dot: true  },
  resolved: { label: T("Resolved"), cls: "border-transparent bg-muted text-muted-foreground", dot: false },
  closed:   { label: T("Closed"),   cls: "border-border bg-muted text-muted-foreground", dot: false },
};

function StatusBadge({ market }: { market: PredictionMarketRow }) {
  const { tr } = useT();
  const status = getMarketStatus(market);
  const { label, cls, dot } = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {dot && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
        </span>
      )}
      {tr(label)}
    </span>
  );
}

// ─── Implied probability ──────────────────────────────────────────────────────────────

function computeProbabilities(options: MarketOption[]): number[] {
  const inverses = options.map((o) => 1 / o.oddsMultiplier);
  const total    = inverses.reduce((s, v) => s + v, 0);
  return inverses.map((v) => Math.round((v / total) * 100));
}

// ─── Share button ──────────────────────────────────────────────────────────────────

function ShareButton({ slug, title }: { slug: string; title: string }) {
  const { tr } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <Share2 className="size-3.5" />
        {tr("Share")}
      </button>
      <ShareSheet
        open={open}
        onClose={() => setOpen(false)}
        images={[`/api/og/market/${encodeURIComponent(slug)}`]}
        text={tr("{title} — what's your prediction? Trade on OMdotfun", { title })}
      />
    </>
  );
}

// ─── Market visual ────────────────────────────────────────────────────────────────

function MarketVisual({ market }: { market: PredictionMarketRow }) {
  const { tr } = useT();
  if (market.visual_type === "vs") {
    return (
      <div className="flex items-center justify-center gap-4 py-2">
        <Competitor name={market.left_competitor_name}  src={market.left_competitor_image_src}  />
        <span className="rounded-lg bg-muted px-2 py-1 text-sm font-black text-muted-foreground">{tr("VS")}</span>
        <Competitor name={market.right_competitor_name} src={market.right_competitor_image_src} />
      </div>
    );
  }
  if (market.visual_type === "simple" && market.single_name) {
    return (
      <div className="flex items-center gap-3 py-2">
        {market.single_image_src && (
          <img
            src={market.single_image_src}
            alt={market.single_name}
            className="size-10 rounded-full object-cover border border-border"
            loading="lazy"
          />
        )}
        <span className="text-base font-semibold text-foreground">{market.single_name}</span>
      </div>
    );
  }
  return null;
}

function Competitor({ name, src }: { name: string | null; src: string | null }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {src ? (
        <img src={src} alt={name ?? ""} className="size-12 rounded-full object-cover border border-border" loading="lazy" />
      ) : (
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-lg font-bold text-foreground">
          {name?.[0] ?? "?"}
        </div>
      )}
      <span className="text-[13px] font-semibold text-foreground text-center max-w-[96px] truncate">{name}</span>
    </div>
  );
}

// ─── Reward summary ───────────────────────────────────────────────────────────────

function RewardSummary({
  amount,
  option,
  token,
}: {
  amount: number;
  option: MarketOption;
  token: BetToken;
}) {
  const { tr, lang } = useT();
  const reward = computeReward(amount, option.oddsMultiplier);

  const fmt = (n: number) =>
    token === "clawdtrust"
      ? `${n.toLocaleString(LOCALES[lang])} ClawdTrust`
      : `$${n.toFixed(2)} USDC`;

  return (
    <div className="num space-y-2 border-t border-border pt-4 text-sm">
      <div className="flex justify-between text-muted-foreground">
        <span>{tr("Stake")}</span>
        <span className="font-medium text-foreground">{fmt(reward.stake)}</span>
      </div>
      <div className="flex justify-between text-zinc-500 text-xs dark:text-zinc-500">
        <span>{tr("Reserve fee (1%)")}</span>
        <span>+{fmt(reward.reserveFee)}</span>
      </div>
      <div className="flex justify-between border-t border-border pt-2 text-zinc-700 font-semibold dark:text-zinc-300">
        <span>{tr("You pay")}</span>
        <span>{fmt(reward.totalCharged)}</span>
      </div>
      <div className="flex justify-between text-emerald-700 font-bold dark:text-emerald-400">
        <span>{tr("Potential win ×{mult}", { mult: option.oddsMultiplier })}</span>
        <span>{fmt(reward.netReward)} <span className="text-xs font-normal text-muted-foreground">{tr("net")}</span></span>
      </div>
    </div>
  );
}

// ─── Success banner ───────────────────────────────────────────────────────────────

function SuccessBanner({ reference }: { reference: string }) {
  const { tr } = useT();
  return (
    <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-5 text-center space-y-2 dark:border-emerald-800/60 dark:bg-emerald-950/20">
      <div className="flex justify-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-up dark:bg-emerald-950/50 dark:text-emerald-400">
          <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </span>
      </div>
      <p className="text-base font-semibold text-emerald-900 dark:text-emerald-300">{tr("Prediction submitted!")}</p>
      <p className="text-sm text-up">
        {tr("Your prediction is pending admin review. You'll be credited once confirmed.")}
      </p>
      <p className="text-xs text-zinc-400 font-mono break-all">{tr("ref: {ref}", { ref: reference })}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────────

export function PredictionDetail({
  market,
  volumeDetail,
  initialComments,
}: {
  market: PredictionMarketRow;
  volumeDetail: MarketVolumeDetail;
  initialComments: MarketCommentEnriched[];
}) {
  const { tr, lang } = useT();
  const { walletAddress, walletType, isAuthenticated, setWalletType } = useAuth();

  const options = useMemo(() => parseMarketOptions(market.options), [market.options]);
  const probs   = useMemo(() => computeProbabilities(options), [options]);

  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [token,         setToken]         = useState<BetToken>("usdc");
  const [rawAmount,     setRawAmount]     = useState("");
  const [submitState,   setSubmitState]   = useState<SubmitState>("idle");
  const [successRef,    setSuccessRef]    = useState("");
  const [showWallet,    setShowWallet]    = useState(false);
  const [betOpen,       setBetOpen]       = useState(false);
  useEffect(() => { if (submitState === "success") setBetOpen(false); }, [submitState]);
  useEffect(() => {
    if (!betOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [betOpen]);

  const amount      = parseFloat(rawAmount) || 0;
  const selectedOpt = options.find((o) => o.id === selectedId) ?? null;

  const minStake = token === "clawdtrust" ? MIN_STAKE_CLT : MIN_STAKE_USDC;
  const maxStake = token === "clawdtrust" ? Infinity       : MAX_STAKE_USDC;
  const isAmountValid = amount >= minStake && amount <= maxStake;
  const canSubmit = !!selectedOpt && isAmountValid && submitState === "idle";

  const handleWalletSelect = useCallback(async (type: WalletType) => {
    setShowWallet(false);
    try {
      await connectWalletAndAuth(type);
      setWalletType(type);
    } catch (err) {
      toast.error(tr("Connection failed"), {
        description: tr(err instanceof Error ? err.message : "Could not connect wallet."),
      });
    }
  }, [setWalletType, tr]);

  async function handleSubmit() {
    if (!isAuthenticated || !walletAddress) {
      setShowWallet(true);
      return;
    }
    if (!selectedOpt) {
      toast.error(tr("Choose an option first."));
      return;
    }
    if (!isAmountValid) {
      toast.error(tr("Invalid amount"), {
        description:
          token === "clawdtrust"
            ? tr("Minimum {min} ClawdTrust.", { min: MIN_STAKE_CLT.toLocaleString(LOCALES[lang]) })
            : tr("Enter between ${min} and ${max} USDC.", { min: MIN_STAKE_USDC, max: MAX_STAKE_USDC }),
      });
      return;
    }

    setSubmitState("signing");

    const result = await submitBet({
      marketId:         market.id,
      marketTitle:      market.title,
      categoryId:       market.category_id,
      optionId:         selectedOpt.id,
      optionLabel:      selectedOpt.label,
      optionMultiplier: selectedOpt.oddsMultiplier,
      amount,
      token,
      walletAddress,
      walletType: walletType!,
    });

    if (result.success) {
      setSubmitState("success");
      setSuccessRef(result.reference);
    } else {
      setSubmitState("error");
      toast.error(tr(result.error));
    }
  }

  const totalVol = fmtVol(volumeDetail.total.usdc, volumeDetail.total.clt, LOCALES[lang]);

  return (
    <>
      {/* Wallet dialog */}
      {showWallet && (
        <WalletSelectDialog
          wallets={getAvailableWallets()}
          onSelect={handleWalletSelect}
          onClose={() => setShowWallet(false)}
        />
      )}

      {/* Market header card */}
      <div className="mb-6">
        {/* Top row: status + share */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <StatusBadge market={market} />
          <ShareButton slug={market.slug ?? market.id} title={market.title} />
        </div>

        {/* Title */}
        <p className="text-[22px] font-bold tracking-tight text-foreground leading-tight mb-3 sm:text-[26px]">
          {market.title}
        </p>

        {/* Countdown badge */}
        {market.event_start_at && (
          <div className="mb-3">
            <MarketCountdownBadge eventStartAt={market.event_start_at} />
          </div>
        )}

        <MarketVisual market={market} />

        {/* Crypto price chart — shown only when ticker + target are set */}
        {market.price_ticker && market.price_target != null && (
          <div className="mt-4">
            <CryptoPriceChart
              ticker={market.price_ticker as "BTCUSDT" | "SOLUSDT" | "ETHUSDT"}
              priceTarget={market.price_target}
              marketCloseAt={market.event_start_at}
            />
          </div>
        )}

        {/* Volume + date row */}
        <div className="num mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-[13px] text-muted-foreground">
          {totalVol !== "—" && (
            <span>
              <span className="font-semibold text-foreground">{tr("Vol:")}</span> {totalVol}
            </span>
          )}
          {market.event_start_at && (
            <span>{new Intl.DateTimeFormat(LOCALES[lang], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(market.event_start_at))}</span>
          )}
        </div>
      </div>

      {/* Success state */}
      {submitState === "success" ? (
        <SuccessBanner reference={successRef} />
      ) : (
        <div className="space-y-5">

          {/* 1 — Option selector with % */}
          <section>
            <h2 className="mb-3 text-lg font-bold tracking-tight text-foreground">
              {tr("Your prediction")}
            </h2>
            <div
              className={
                options.length === 3
                  ? "flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0"
                  : "grid grid-cols-2 gap-2"
              }
            >
              {options.map((opt, idx) => {
                const isSelected  = opt.id === selectedId;
                const prob        = probs[idx];
                const optVol      = volumeDetail.byOption[opt.id];
                const optVolLabel = optVol ? fmtVol(optVol.usdc, optVol.clt, LOCALES[lang]) : null;
                const color       = optionColor(idx, opt.label);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => { setSelectedId(opt.id); setBetOpen(true); }}
                    className={[
                      "flex flex-col gap-2 rounded-[18px] border-2 px-3.5 py-3.5 text-left transition-all",
                      options.length === 3 ? "min-w-[130px] shrink-0 sm:min-w-0 sm:shrink" : "",
                      isSelected
                        ? `${color.border} ${color.bg} shadow-lg`
                        : color.idle,
                    ].join(" ")}
                  >
                    {/* Logo + multiplier */}
                    <div className="flex items-center justify-between gap-2">
                      {opt.logoSrc ? (
                        <img
                          src={opt.logoSrc}
                          alt={opt.label}
                          className="size-6 shrink-0 rounded-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="size-6 shrink-0" />
                      )}
                      <span className={`num shrink-0 text-base font-bold ${isSelected ? color.text : "text-foreground"}`}>
                        x{opt.oddsMultiplier}
                      </span>
                    </div>
                    {/* Label */}
                    <span className={`line-clamp-2 text-sm font-bold leading-tight ${isSelected ? color.text : "text-foreground"}`}>
                      {opt.label}
                    </span>
                    {/* Probability % */}
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className={`num text-[22px] leading-none font-bold ${isSelected ? color.probText : "text-foreground"}`}>
                        {prob}%
                      </span>
                      {optVolLabel && (
                        <span className={`text-[10px] truncate ${isSelected ? color.volText : "text-muted-foreground"}`}>
                          {optVolLabel}
                        </span>
                      )}
                    </div>
                    {/* Probability bar */}
                    <div className={`h-1.5 w-full rounded-full overflow-hidden ${isSelected ? color.barBg : "bg-muted"}`}>
                      <div
                        className={`h-full rounded-full transition-all ${isSelected ? color.barFill : color.bar}`}
                        style={{ width: `${prob}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2 → 5 — Fenêtre de mise (s'ouvre au choix d'une option) */}
          {betOpen && selectedOpt && (
            <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" role="dialog" aria-modal="true">
              <div className="absolute inset-0 bg-black/60" onClick={() => setBetOpen(false)} aria-hidden />
              <div className="relative max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-card px-5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3 md:rounded-[28px] md:pb-5">
                <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted md:hidden" />
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex gap-1 rounded-full bg-muted p-1">
                    {(["usdc", "clawdtrust"] as BetToken[]).map((t) => (
                      <button key={t} type="button" onClick={() => { setToken(t); setRawAmount(""); }}
                        className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors ${token === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                        {t === "usdc" ? "USDC" : "ClawdTrust"}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => setBetOpen(false)} aria-label={tr("Close")}
                    className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground">
                    <X className="size-4" />
                  </button>
                </div>

                {/* Marché */}
                <div className="mb-4 flex items-center gap-3">
                  {(market.single_image_src ?? market.left_competitor_image_src) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={(market.single_image_src ?? market.left_competitor_image_src)!} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-lg font-bold text-foreground">{market.title.trim()[0]?.toUpperCase()}</span>
                  )}
                  <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">{market.title}</p>
                </div>

                {/* Options */}
                <div className={`mb-5 grid gap-2 ${options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                  {options.map((opt, idx) => {
                    const on = opt.id === selectedId;
                    return (
                      <button key={opt.id} type="button" onClick={() => setSelectedId(opt.id)}
                        className={`min-w-0 rounded-2xl px-2 py-3 text-[15px] font-bold transition-colors ${on ? "bg-up/15 text-up ring-1 ring-up/40" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                        <span className="block truncate">{opt.label} <span className="num">{probs[idx]}%</span></span>
                      </button>
                    );
                  })}
                </div>

                {/* Montant */}
                <p className="text-[15px] font-semibold text-foreground">{tr("Amount")}</p>
                <div className="flex items-baseline justify-center gap-2 py-3">
                  <span className={`num text-[52px] font-bold leading-none tracking-tight ${rawAmount ? "text-foreground" : "text-muted-foreground/50"}`}>{rawAmount || "0"}</span>
                  <span className="text-xl font-bold text-muted-foreground">{token === "clawdtrust" ? "CLT" : "USDC"}</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {(token === "clawdtrust" ? [100_000, 500_000, 1_000_000, 2_000_000] : [1, 5, 10, 100]).map((v) => (
                    <button key={v} type="button"
                      onClick={() => setRawAmount((prev) => String(Math.round(((parseFloat(prev) || 0) + v) * 100) / 100))}
                      className="num flex items-center justify-center gap-0.5 rounded-xl bg-muted py-2.5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted/70">
                      <Plus className="size-3" />{token === "clawdtrust" ? formatCLT(v) : `$${v}`}
                    </button>
                  ))}
                  <button type="button"
                    onClick={() => setRawAmount(token === "clawdtrust" ? String(Math.max(MIN_STAKE_CLT, amount)) : String(MAX_STAKE_USDC))}
                    className="rounded-xl bg-muted py-2.5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted/70">
                    {token === "clawdtrust" ? tr("Min") : tr("Max")}
                  </button>
                </div>
                {rawAmount && !isAmountValid && (
                  <p className="mt-2 text-xs text-red-500 dark:text-red-400">
                    {token === "clawdtrust"
                      ? tr("Minimum {min} ClawdTrust", { min: MIN_STAKE_CLT.toLocaleString(LOCALES[lang]) })
                      : tr("Enter between ${min} and ${max}", { min: MIN_STAKE_USDC, max: MAX_STAKE_USDC })}
                  </p>
                )}

                {/* À gagner */}
                <div className="mt-4 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[15px] text-muted-foreground">
                    {tr("To win")}
                    <span className="rounded-md bg-up/15 px-1.5 py-0.5 text-xs font-semibold text-up">{selectedOpt.label}</span>
                  </span>
                  <span className="num text-[30px] font-bold leading-none text-up">
                    {(() => {
                      const r = isAmountValid ? computeReward(amount, selectedOpt.oddsMultiplier).netReward : 0;
                      return token === "clawdtrust" ? `${Math.round(r).toLocaleString(LOCALES[lang])}` : `$${r.toFixed(2)}`;
                    })()}
                  </span>
                </div>
                {isAmountValid && (
                  <p className="mt-1 text-right text-xs text-muted-foreground">
                    {tr("You pay {amount} · incl. 1% fee · ×{mult}", {
                      amount: token === "clawdtrust"
                        ? `${computeReward(amount, selectedOpt.oddsMultiplier).totalCharged.toLocaleString(LOCALES[lang])} CLT`
                        : `$${computeReward(amount, selectedOpt.oddsMultiplier).totalCharged.toFixed(2)}`,
                      mult: selectedOpt.oddsMultiplier,
                    })}
                  </p>
                )}

                {/* Valider */}
                <button
                  type="button"
                  onClick={() => { if (!isAuthenticated) { setBetOpen(false); setShowWallet(true); } else { void handleSubmit(); } }}
                  disabled={isAuthenticated && !canSubmit}
                  className={`mt-5 h-14 w-full rounded-2xl px-5 text-base font-bold transition-colors ${
                    isAuthenticated && !canSubmit ? "cursor-not-allowed bg-muted text-muted-foreground" : "bg-primary text-white hover:opacity-90"
                  }`}
                >
                  {submitState === "signing" ? tr("Waiting for signature…")
                    : submitState === "submitting" ? tr("Confirming…")
                    : !isAuthenticated ? tr("Connect wallet")
                    : tr("Predict {label}", { label: selectedOpt.label })}
                </button>

                {/* Pavé numérique */}
                <div className="mt-3">
                  <SwapKeypad value={rawAmount} onChange={setRawAmount} maxDecimals={token === "clawdtrust" ? 0 : 2} />
                </div>
              </div>
            </div>
          )}

          {/* 7 — Resolution criteria */}
          {market.resolution_criteria && (
            <section className="space-y-2">
              <h2 className="text-[13px] font-semibold text-muted-foreground">
                 {tr("Resolution criteria")}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {market.resolution_criteria}
              </p>
            </section>
          )}

          {/* 8 — Comments */}
          <CommentsSection
            marketId={market.id}
            initialComments={initialComments}
            isAuthenticated={isAuthenticated}
            walletAddress={walletAddress}
          />
        </div>
      )}
    </>
  );
}

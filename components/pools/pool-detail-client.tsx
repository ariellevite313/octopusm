"use client";

import { captureVia } from "@/lib/social/share-via";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Clock, Loader2, Share2, Trophy } from "lucide-react";
import { MutuelMarketRow, MutuelOption } from "@/lib/supabase/types";
import type { MarketCommentEnriched } from "@/lib/supabase/types";
import { CommentsSection } from "@/components/shared/comments-section";
import { ShareSheet } from "@/components/shared/share-sheet";
import { TokenLogo } from "@/components/shared/token-logo";
import { submitPoolBet } from "@/lib/market/pool-betting";
import type { PoolBetToken } from "@/lib/market/pool-betting";
import { useAuth } from "@/providers/auth-provider";
import { WalletSelectDialog } from "@/components/wallet/wallet-select-dialog";
import { connectWalletAndAuth } from "@/lib/wallet/auth";
import { getAvailableWallets, type WalletType } from "@/lib/wallet/adapters";
import { toast } from "sonner";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";
import { ListPager } from "@/components/profile/list-pager";
import { useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";

// ─── Option color palette ─────────────────────────────────────────────────────
// Used for progress bars and selected-option highlights (cycles through options)
const OPTION_COLORS = [
  { bar: "bg-blue-500",   selected: "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400",   hover: "hover:border-blue-300",   winner: "text-blue-600 dark:text-blue-400" },
  { bar: "bg-red-500",    selected: "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400",       hover: "hover:border-red-300",    winner: "text-down" },
  { bar: "bg-green-500",  selected: "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400", hover: "hover:border-green-300",  winner: "text-green-600 dark:text-green-400" },
  { bar: "bg-orange-500", selected: "border-orange-500 bg-foreground/5 text-foreground", hover: "hover:border-orange-300", winner: "text-foreground" },
  { bar: "bg-purple-500", selected: "border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-400", hover: "hover:border-purple-300", winner: "text-purple-600 dark:text-purple-400" },
  { bar: "bg-yellow-500", selected: "border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/20 dark:text-yellow-400", hover: "hover:border-yellow-300", winner: "text-yellow-600 dark:text-yellow-400" },
];
function optionColor(index: number, label?: string) {
  const l = label?.trim().toLowerCase();
  if (l === "yes") return OPTION_COLORS[2]; // green
  if (l === "no")  return OPTION_COLORS[1]; // red
  return OPTION_COLORS[index % OPTION_COLORS.length];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

interface RawBet {
  id?: string;
  option_id: string;
  amount: number;
  token: string;
  wallet_address?: string;
  username?: string | null;
  avatar_src?: string | null;
  octo_balance?: number;
  created_at: string;
  payout_amount?: number | null;
  paid_at?: string | null;
}

function computeTotals(bets: RawBet[], options: MutuelOption[]) {
  const totals: Record<string, number> = {};
  for (const opt of options) totals[opt.id] = 0;
  for (const b of bets) {
    if (b.option_id in totals) totals[b.option_id] += Number(b.amount);
  }
  return totals;
}

function computePcts(totals: Record<string, number>, options: MutuelOption[]) {
  const grand = Object.values(totals).reduce((s, v) => s + v, 0);
  const pcts: Record<string, number> = {};
  for (const opt of options) {
    pcts[opt.id] = grand > 0
      ? Math.round((totals[opt.id] / grand) * 100)
      : Math.round(100 / options.length);
  }
  return pcts;
}

function impliedOdds(pct: number) {
  if (pct <= 0) return "∞";
  return (100 / pct).toFixed(2) + "x";
}

function timeLeft(closesAt: string, tr: (s: string, v?: Record<string, string | number>) => string): string {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return tr("Predictions closed");
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 48) return tr("{d}d {h}h left", { d: Math.floor(h / 24), h: h % 24 });
  if (h >= 1) return tr("{h}h {m}m left", { h, m });
  return tr("{m}m left", { m });
}

function truncWallet(w: string) {
  return w.length > 12 ? `${w.slice(0, 4)}...${w.slice(-4)}` : w;
}

function tokenLabel(token: string) {
  return token === "usdc" ? "USDC" : "ClawdTrust";
}



// BUG-23 fix: read the actual rates applied during resolution from admin_notes
// (stored as "RATES:{...}" by the resolve action). Fall back to defaults if not present.
function parseResolutionRates(adminNotes: string | null, betToken: string): { house: number; creator: number; winners: number } {
  if (adminNotes?.startsWith("RATES:")) {
    try {
      return JSON.parse(adminNotes.slice(6));
    } catch { /* fall through to defaults */ }
  }
  return betToken === "clawdtrust"
    ? { house: 0.10, creator: 0.06, winners: 0.84 }
    : { house: 0.15, creator: 0.05, winners: 0.80 };
}

const STATUS_LABEL: Record<string, string> = {
  active:    T("Active"),
  closed:    T("Closed"),
  resolved:  T("Resolved"),
  cancelled: T("Cancelled"),
  pending:   T("Pending"),
  rejected:  T("Rejected"),
};

const STATUS_COLORS: Record<string, string> = {
  active:    "text-up",
  closed:    "text-amber-600 dark:text-amber-400",
  resolved:  "text-violet-600 dark:text-violet-400",
  cancelled: "text-red-500 dark:text-red-400",
  pending:   "text-amber-500 dark:text-amber-400",
  rejected:  "text-red-500 dark:text-red-400",
};

// Bug #8 fix: only two real steps — signing (wallet approval) then done
type PredictStep =
  | "idle"
  | "signing"   // wallet approval + broadcast (single async call)
  | "pending"   // success - awaiting admin validation
  | "error";

// ─── Predict form ─────────────────────────────────────────────────────────────

interface PredictFormProps {
  market: MutuelMarketRow;
  options: MutuelOption[];
  pcts: Record<string, number>;
  onRequestConnect: () => void;
}

function PredictForm({ market, options, pcts, onRequestConnect }: PredictFormProps) {
  const { tr } = useT();
  // Bug #6 fix: read walletType from useAuth instead of localStorage directly
  const { walletAddress, walletType } = useAuth();
  // Option choisie depuis un post du fil (?option=…)
  const [selectedOption, setSelectedOption] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const o = new URLSearchParams(window.location.search).get("option");
    return o && options.some((x) => x.id === o) ? o : null;
  });
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<PredictStep>("idle");
  const [reference, setReference] = useState<string | null>(null);

  const token = market.bet_token as PoolBetToken;
  const isClosed = market.status !== "active" || new Date(market.betting_closes_at) <= new Date();
  const isBusy = step === "signing";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!walletAddress) { onRequestConnect(); return; }
    if (!selectedOption) { toast.error(tr("Select an option.")); return; }
    const numAmt = parseFloat(amount);
    if (!numAmt || numAmt <= 0) { toast.error(tr("Enter a valid amount.")); return; }
    const minAmt = token === "usdc" ? 2 : 500_000;
    if (numAmt < minAmt) { toast.error(tr("Minimum stake is {min}.", { min: token === "usdc" ? "2 USDC" : "500,000 ClawdTrust" })); return; }

    const opt = options.find(o => o.id === selectedOption);
    if (!opt) return;

    setStep("signing");
    const result = await submitPoolBet({
      marketId:      market.id,
      marketTitle:   market.title,
      optionId:      selectedOption,
      optionLabel:   opt.label,
      amount:        numAmt,
      token,
      walletAddress,
      // Bug #6 fix: use walletType from auth context, fallback to phantom
      walletType:    (walletType ?? "phantom") as WalletType,
    });

    if (!result.success) {
      setStep("error");
      toast.error(tr(result.error));
      return;
    }

    setReference(result.reference);
    setStep("pending");
    setAmount("");
    setSelectedOption(null);
  }

  if (isClosed) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        {tr("Predictions are closed for this market.")}
      </div>
    );
  }

  if (step === "pending") {
    return (
      <div className="py-2">
        <div className="mb-3 flex items-center gap-2">
          <Check className="size-5 text-up" />
          <p className="font-semibold text-up">
            {tr("Prediction submitted!")}
          </p>
        </div>
        <p className="mb-2 text-sm text-foreground">
          {tr("Your transfer has been sent on-chain. An admin will validate your prediction shortly — it will then appear in the live odds.")}
        </p>
        {reference && (
          <p className="text-xs text-muted-foreground">
            {tr("Reference:")} <span className="font-mono">{reference}</span>
          </p>
        )}
        <button
          onClick={() => setStep("idle")}
          className="mt-4 rounded-full bg-muted px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted/70"
        >
          {tr("Place another prediction")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <h3 className="mb-1 text-lg font-bold tracking-tight text-foreground">{tr("Make a prediction")}</h3>
      <p className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        {tr("Market uses")}
        <TokenLogo token={token} className="size-4" />
        <span className="font-semibold text-foreground">{tokenLabel(token)}</span>
        {tr("— winnings paid in {token}.", { token: tokenLabel(token) })}
      </p>

      <div className="mb-5 flex flex-col divide-y divide-border">
        {options.map((opt, idx) => {
          const col = optionColor(idx, opt.label);
          const on = selectedOption === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={isBusy}
              onClick={() => { setSelectedOption(opt.id); }}
              aria-pressed={on}
              className="flex items-center justify-between py-3.5 text-left text-[15px] text-foreground transition-opacity disabled:cursor-not-allowed hover:opacity-80"
            >
              <span className={`flex items-center gap-3 ${on ? "font-bold" : "font-medium"}`}>
                <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-foreground" : "border-muted-foreground/40"}`}>
                  {on && <span className={`size-2.5 rounded-full ${col.bar}`} />}
                </span>
                {opt.image_url && (
                  <img src={opt.image_url} alt="" className="size-5 shrink-0 rounded-xl object-cover" />
                )}
                {opt.label}
              </span>
              <span className={`num text-sm tabular-nums ${on ? "font-bold text-foreground" : "text-muted-foreground"}`}>{pcts[opt.id]}%</span>
            </button>
          );
        })}
      </div>

      <div className="mb-4">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <TokenLogo token={token} className="size-4" />
          {tr("Amount ({token})", { token: tokenLabel(token) })}
        </label>
        <input
          type="number"
          min="0.01"
          step="any"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0.00"
          disabled={isBusy}
          className="num w-full border-0 border-b border-border bg-transparent px-0 py-2 text-2xl font-bold text-foreground placeholder:text-muted-foreground/50 focus:border-foreground focus:outline-none disabled:opacity-50"
        />
      </div>

      {isBusy && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-xs text-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {tr("Approve in wallet and waiting for confirmation...")}
        </div>
      )}

      <button
        type="submit"
        disabled={isBusy}
        className="w-full rounded-[14px] bg-orange-500 py-2.5 text-sm font-bold text-white hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 btn-primary"
      >
        {isBusy && <Loader2 className="size-4 animate-spin" />}
        {isBusy ? tr("Approving...") : tr("Predict")}
      </button>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        {tr("Your prediction is validated by an admin before appearing in live odds.")}
      </p>
    </form>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface Props {
  market: MutuelMarketRow;
  initialBets: RawBet[];
  initialComments: MarketCommentEnriched[];
  isPreview?: boolean;
  isAdmin?: boolean;
}

export function PoolDetailClient({ market, initialBets, initialComments, isPreview = false, isAdmin = false }: Props) {
  const { tr } = useT();
  const { walletAddress, setWalletType } = useAuth();
  const [showWalletDialog, setShowWalletDialog] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Visiteur venu d'un post du fil (?via=…) : retenu pour la récompense de partage
  useEffect(() => { captureVia(market.id); }, [market.id]);

  async function handleSelectWallet(type: WalletType) {
    setShowWalletDialog(false);
    try {
      const result = await connectWalletAndAuth(type);
      if (result.success) {
        setWalletType(type);
        toast.success(tr("Wallet connected"));
      } else {
        toast.error(tr(result.error ?? "Connection failed"));
      }
    } catch {
      toast.error(tr("Connection failed"));
    }
  }

  const options = (market.options ?? []) as MutuelOption[];
  const [bets, setBets] = useState<RawBet[]>(initialBets);
  const [betPage, setBetPage] = useState(0);

  // Bug #13 fix: memoize expensive computations
  const totals = useMemo(() => computeTotals(bets, options), [bets, options]);
  const pcts   = useMemo(() => computePcts(totals, options), [totals, options]);
  const grandTotal = useMemo(() => Object.values(totals).reduce((s, v) => s + v, 0), [totals]);

  const decimals = market.bet_token === "usdc" ? 2 : 0;

  // Real-time refresh every 15s when active
  useEffect(() => {
    if (market.status !== "active") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pools/${market.id}/bets`);
        if (!res.ok) return;
        const freshBets = await res.json() as RawBet[];
        setBets(freshBets);
      } catch { /* silent */ }
    }, 15_000);
    return () => clearInterval(interval);
  }, [market.id, market.status]);

  return (
    <>
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/prediction"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {tr("Markets")}
      </Link>

      {isPreview && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-foreground">
            {isAdmin
              ? market.status === "rejected" ? tr("Admin — Market rejected") : tr("Admin — Preview before approval")
              : market.status === "rejected" ? tr("Market rejected") : tr("Pending approval")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAdmin
              ? market.status === "rejected"
                ? tr("This market has been rejected.") + (market.admin_notes ? " " + tr("Reason: {reason}", { reason: market.admin_notes }) : "")
                : tr("You are viewing this market as an admin. It is not yet visible to the public.")
              : market.status === "rejected"
                ? tr("Your market has been rejected by an admin.") + (market.admin_notes ? " " + tr("Reason: {reason}", { reason: market.admin_notes }) : "")
                : tr("Your market is under review. This page is only visible to you — share it once approved.")}
          </p>
        </div>
      )}

      {/* En-tête : image + statut + partage sur une ligne, titre pleine largeur dessous */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {market.cover_image_src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={market.cover_image_src} alt={market.title} className="size-12 shrink-0 rounded-xl object-cover" />
          )}
          <span className={`text-sm font-semibold capitalize ${STATUS_COLORS[market.status] ?? "text-muted-foreground"}`}>
            {STATUS_LABEL[market.status] ? tr(STATUS_LABEL[market.status]) : market.status}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={tr("Share")}
        >
          <Share2 className="size-[18px]" />
        </button>
        <ShareSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          images={[`/api/og/market/${encodeURIComponent(market.slug)}`]}
          text={tr("{title} — what's your prediction? Trade on OMdotfun", { title: market.title })}
        />
      </div>
      <h1 className="mb-3 text-[22px] font-bold leading-tight tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-[26px]">{market.title}</h1>

      {market.description && (
        <p className="mb-5 whitespace-pre-line break-words text-[15px] leading-relaxed text-muted-foreground">{market.description}</p>
      )}

      <div className="mb-8 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-4" />
          {market.status === "active" ? timeLeft(market.betting_closes_at, tr) : (STATUS_LABEL[market.status] ? tr(STATUS_LABEL[market.status]) : market.status)}
        </span>
        <span className="flex items-center gap-1">
          <TokenLogo token={market.bet_token} className="size-4" />
          {tr("{amount} {token} total", { amount: grandTotal.toFixed(decimals), token: tokenLabel(market.bet_token) })}
        </span>
        <span>{bets.length !== 1 ? tr("{n} predictions", { n: bets.length }) : tr("{n} prediction", { n: bets.length })}</span>
        <span className="flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5 font-semibold text-foreground">
          <TokenLogo token={market.bet_token} className="size-4" />
          {tokenLabel(market.bet_token)}
        </span>
      </div>

      {market.status === "cancelled" && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-foreground">
            {tr("Market cancelled")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tr("This market was cancelled by an admin. All stakes are being refunded (minus 5% fee). Check your dashboard to claim your refund.")}
          </p>
        </div>
      )}

      {/* Bug #9 fix: resolved banner shows even when winning_option_id is null */}
      {market.status === "resolved" && (
        <div className="mb-6">
          {market.winning_option_id ? (
            <>
              <p className="text-base font-bold text-foreground">
                {tr("Winner:")}{" "}
                {options.find(o => o.id === market.winning_option_id)?.label ?? market.winning_option_id}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                {tr("Winners total:")}
                <TokenLogo token={market.bet_token} className="size-4" />
                {(grandTotal * parseResolutionRates(market.admin_notes ?? null, market.bet_token).winners).toFixed(decimals)}{" "}
                {tokenLabel(market.bet_token)}{" "}
                ({tr("{pct}% of {total}", { pct: Math.round(parseResolutionRates(market.admin_notes ?? null, market.bet_token).winners * 100), total: grandTotal.toFixed(decimals) })})
              </p>
            </>
          ) : (
            <p className="text-base font-bold text-foreground">
              {tr("Market resolved — payouts being processed.")}
            </p>
          )}
        </div>
      )}

      {/* Odds bars */}
      <div className="mb-8 flex flex-col gap-4">
        <h2 className="text-lg font-bold tracking-tight text-foreground">{tr("Live odds")}</h2>
        {options.map((opt, idx) => {
          const isWinner = market.status === "resolved" && market.winning_option_id === opt.id;
          const col = optionColor(idx, opt.label);
          return (
            <div key={opt.id} className={`flex flex-col gap-1 ${market.status === "resolved" && !isWinner ? "opacity-50" : ""}`}>
              <div className="flex justify-between text-sm">
                <span className={`flex items-center gap-2 font-medium ${isWinner ? `font-bold ${col.winner}` : "text-foreground"}`}>
                  {opt.image_url && (
                    <img src={opt.image_url} alt="" className="size-5 shrink-0 rounded-xl object-cover" />
                  )}
                  {opt.label} {isWinner && <Trophy className="size-3.5" />}
                </span>
                <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
                  {pcts[opt.id]}% · {impliedOdds(pcts[opt.id])} ·
                  <TokenLogo token={market.bet_token} className="size-4" />
                  {totals[opt.id].toFixed(decimals)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${col.bar}`}
                  style={{ width: `${pcts[opt.id]}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-8">
        {isPreview ? (
          <div className="py-5 text-center text-sm text-muted-foreground">
            {tr("Bets will open once the market is approved.")}
          </div>
        ) : (
          <PredictForm
            market={market}
            options={options}
            pcts={pcts}
            onRequestConnect={() => setShowWalletDialog(true)}
          />
        )}
      </div>

      {/* Recent predictions */}
      <div className="mb-10">
        <h2 className="mb-2 text-lg font-bold tracking-tight text-foreground">{tr("Recent predictions")}</h2>
        {bets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr("No predictions yet. Be the first!")}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {bets.slice(betPage * 5, betPage * 5 + 5).map((bet, i) => {
              const optLabel = options.find(o => o.id === bet.option_id)?.label ?? bet.option_id;
              // Bug #10 fix: stable key using created_at + option_id + index fallback
              const key = `${bet.created_at}-${bet.option_id}-${i}`;
              return (
                <div key={key} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                  {bet.wallet_address && (
                    <Link
                      href={`/profile/${bet.wallet_address}`}
                      className="flex items-center gap-2 min-w-0 shrink-0 hover:opacity-80 transition-opacity"
                    >
                      {bet.avatar_src ? (
                        <img
                          src={bet.avatar_src}
                          alt=""
                          className="size-6 rounded-full object-cover shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="size-6 shrink-0 flex items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">
                          {(bet.username ?? bet.wallet_address)?.[0]?.toUpperCase() ?? "?"}
                        </div>
                      )}
                      <span className="font-medium text-foreground truncate max-w-[80px]">
                        {bet.username ?? truncWallet(bet.wallet_address)}
                      </span>
                      {(bet.octo_balance ?? 0) > 0 && (
                        <OctoBadge totalOcto={bet.octo_balance!} size={11} />
                      )}
                    </Link>
                  )}
                  <span className="font-semibold text-foreground">{optLabel}</span>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
                      <TokenLogo token={market.bet_token} className="size-4" />
                      {Number(bet.amount).toFixed(decimals)}
                    </span>
                    {bet.payout_amount != null && (
                      <span className={`flex items-center gap-0.5 tabular-nums text-[11px] font-semibold ${bet.paid_at ? "text-up" : "text-foreground"}`}>
                        {bet.paid_at ? tr("✓ Paid") + " " : "→ "}
                        <TokenLogo token={market.bet_token} className="size-4" />
                        {Number(bet.payout_amount).toFixed(decimals)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <ListPager page={betPage} total={Math.ceil(bets.length / 5)} onChange={setBetPage} />
      </div>

      {/* Comments */}
      {/* Bug #5 fix: isAuthenticated based on walletAddress from auth context (already correct — 
          walletAddress is null when disconnected, set on connect) */}
      <div>
        <CommentsSection
          marketId={market.id}
          initialComments={initialComments}
          isAuthenticated={!!walletAddress}
          walletAddress={walletAddress}
          onRequestConnect={() => setShowWalletDialog(true)}
          apiBase="/api/pools"
        />
      </div>
    </div>

    {showWalletDialog && (
      <WalletSelectDialog
        wallets={getAvailableWallets()}
        onSelect={handleSelectWallet}
        onClose={() => setShowWalletDialog(false)}
      />
    )}
    </>
  );
}

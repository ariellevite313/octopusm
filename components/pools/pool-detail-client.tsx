"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, Loader2, Share2 } from "lucide-react";
import { MutuelMarketRow, MutuelOption } from "@/lib/supabase/types";
import type { MarketCommentEnriched } from "@/lib/supabase/types";
import { CommentsSection } from "@/components/shared/comments-section";
import { TokenLogo } from "@/components/shared/token-logo";
import { submitPoolBet } from "@/lib/market/pool-betting";
import type { PoolBetToken } from "@/lib/market/pool-betting";
import { useAuth } from "@/providers/auth-provider";
import { WalletSelectDialog } from "@/components/wallet/wallet-select-dialog";
import { connectWalletAndAuth } from "@/lib/wallet/auth";
import { getAvailableWallets, type WalletType } from "@/lib/wallet/adapters";
import { toast } from "sonner";

// ─── Option color palette ─────────────────────────────────────────────────────
// Used for progress bars and selected-option highlights (cycles through options)
const OPTION_COLORS = [
  { bar: "bg-blue-500",   selected: "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400",   hover: "hover:border-blue-300",   winner: "text-blue-600 dark:text-blue-400" },
  { bar: "bg-red-500",    selected: "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400",       hover: "hover:border-red-300",    winner: "text-red-600 dark:text-red-400" },
  { bar: "bg-green-500",  selected: "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400", hover: "hover:border-green-300",  winner: "text-green-600 dark:text-green-400" },
  { bar: "bg-orange-500", selected: "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400", hover: "hover:border-orange-300", winner: "text-orange-600 dark:text-orange-400" },
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

function timeLeft(closesAt: string): string {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return "Predictions closed";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  if (h >= 1) return `${h}h ${m}m left`;
  return `${m}m left`;
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

const STATUS_COLORS: Record<string, string> = {
  active:    "text-emerald-600 dark:text-emerald-400",
  closed:    "text-amber-600 dark:text-amber-400",
  resolved:  "text-violet-600 dark:text-violet-400",
  cancelled: "text-red-500 dark:text-red-400",  // BUG-20 fix
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
  // Bug #6 fix: read walletType from useAuth instead of localStorage directly
  const { walletAddress, walletType } = useAuth();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<PredictStep>("idle");
  const [reference, setReference] = useState<string | null>(null);

  const token = market.bet_token as PoolBetToken;
  const isClosed = market.status !== "active" || new Date(market.betting_closes_at) <= new Date();
  const isBusy = step === "signing";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!walletAddress) { onRequestConnect(); return; }
    if (!selectedOption) { toast.error("Select an option."); return; }
    const numAmt = parseFloat(amount);
    if (!numAmt || numAmt <= 0) { toast.error("Enter a valid amount."); return; }
    const minAmt = token === "usdc" ? 2 : 500_000;
    if (numAmt < minAmt) { toast.error(`Minimum stake is ${token === "usdc" ? "2 USDC" : "500,000 ClawdTrust"}.`); return; }

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
      toast.error(result.error);
      return;
    }

    setReference(result.reference);
    setStep("pending");
    setAmount("");
    setSelectedOption(null);
  }

  if (isClosed) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 p-5 text-center text-sm text-muted-foreground">
        Predictions are closed for this pool.
      </div>
    );
  }

  if (step === "pending") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/20">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xl">✅</span>
          <p className="font-semibold text-emerald-700 dark:text-emerald-400">
            Prediction submitted!
          </p>
        </div>
        <p className="mb-2 text-sm text-emerald-700 dark:text-emerald-400">
          Your transfer has been sent on-chain. An admin will validate your prediction shortly — it will then appear in the live odds.
        </p>
        {reference && (
          <p className="text-xs text-muted-foreground">
            Reference: <span className="font-mono">{reference}</span>
          </p>
        )}
        <button
          onClick={() => setStep("idle")}
          className="mt-4 rounded-xl border border-emerald-300 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40 transition-colors"
        >
          Place another prediction
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-card p-5">
      <h3 className="mb-1 text-sm font-semibold text-foreground">Make a Prediction</h3>
      <p className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        Pool uses
        <TokenLogo token={token} className="size-3.5" />
        <span className="font-semibold text-foreground">{tokenLabel(token)}</span>
        — winnings paid in {tokenLabel(token)}.
      </p>

      <div className="mb-4 flex flex-col gap-2">
        {options.map((opt, idx) => {
          const col = optionColor(idx, opt.label);
          return (
            <button
              key={opt.id}
              type="button"
              disabled={isBusy}
              onClick={() => { setSelectedOption(opt.id); }}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                selectedOption === opt.id
                  ? col.selected
                  : `border-border text-foreground ${col.hover}`
              }`}
            >
              <span>{opt.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{pcts[opt.id]}%</span>
            </button>
          );
        })}
      </div>

      <div className="mb-4">
        <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <TokenLogo token={token} className="size-3.5" />
          Amount ({tokenLabel(token)})
        </label>
        <input
          type="number"
          min="0.01"
          step="any"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0.00"
          disabled={isBusy}
          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 disabled:opacity-50"
        />
      </div>

      {isBusy && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-orange-50 px-3 py-2.5 text-xs text-orange-700 dark:bg-orange-950/20 dark:text-orange-400">
          <Loader2 className="size-3.5 animate-spin" />
          Approve in wallet and waiting for confirmation...
        </div>
      )}

      <button
        type="submit"
        disabled={isBusy}
        className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {isBusy && <Loader2 className="size-4 animate-spin" />}
        {isBusy ? "Approving..." : "Predict"}
      </button>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Your prediction is validated by an admin before appearing in live odds.
      </p>
    </form>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface Props {
  market: MutuelMarketRow;
  initialBets: RawBet[];
  initialComments: MarketCommentEnriched[];
}

export function PoolDetailClient({ market, initialBets, initialComments }: Props) {
  const { walletAddress, setWalletType } = useAuth();
  const [showWalletDialog, setShowWalletDialog] = useState(false);

  async function handleSelectWallet(type: WalletType) {
    setShowWalletDialog(false);
    try {
      const result = await connectWalletAndAuth(type);
      if (result.success) {
        setWalletType(type);
        toast.success("Wallet connected");
      } else {
        toast.error(result.error ?? "Connection failed");
      }
    } catch {
      toast.error("Connection failed");
    }
  }

  const options = (market.options ?? []) as MutuelOption[];
  const [bets, setBets] = useState<RawBet[]>(initialBets);

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
        href="/pools"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All Bookmakes
      </Link>

      <div className="mb-2 flex items-start gap-4">
        {market.cover_image_src && (
          <div className="size-14 shrink-0 overflow-hidden rounded-xl border border-border">
            <img
              src={market.cover_image_src}
              alt={market.title}
              className="size-14 object-cover"
            />
          </div>
        )}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <h1 className="flex-1 text-2xl font-bold leading-snug text-foreground">{market.title}</h1>
          <div className="flex shrink-0 items-center gap-2 pt-1">
            <span className={`text-sm font-semibold capitalize ${STATUS_COLORS[market.status] ?? "text-muted-foreground"}`}>
              {market.status}
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href).then(() => {
                  toast.success("Link copied!");
                });
              }}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Share"
            >
              <Share2 className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {market.description && (
        <p className="mb-6 text-sm text-muted-foreground">{market.description}</p>
      )}

      <div className="mb-8 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-3.5" />
          {market.status === "active" ? timeLeft(market.betting_closes_at) : market.status}
        </span>
        <span className="flex items-center gap-1">
          <TokenLogo token={market.bet_token} className="size-3.5" />
          {grandTotal.toFixed(decimals)} {tokenLabel(market.bet_token)} total pool
        </span>
        <span>{bets.length} prediction{bets.length !== 1 ? "s" : ""}</span>
        <span className="flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5 font-semibold text-foreground">
          <TokenLogo token={market.bet_token} className="size-3" />
          {tokenLabel(market.bet_token)} pool
        </span>
      </div>

      {market.status === "cancelled" && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/30">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Pool cancelled
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            This pool was cancelled by an admin. All stakes are being refunded (minus 5% fee). Check your dashboard to claim your refund.
          </p>
        </div>
      )}

      {/* Bug #9 fix: resolved banner shows even when winning_option_id is null */}
      {market.status === "resolved" && (
        <div className="mb-6 rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-800 dark:bg-violet-950/20">
          {market.winning_option_id ? (
            <>
              <p className="text-sm font-semibold text-violet-700 dark:text-violet-400">
                ✅ Winner:{" "}
                {options.find(o => o.id === market.winning_option_id)?.label ?? market.winning_option_id}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                Winners pool:
                <TokenLogo token={market.bet_token} className="size-3" />
                {(grandTotal * parseResolutionRates(market.admin_notes ?? null, market.bet_token).winners).toFixed(decimals)}{" "}
                {tokenLabel(market.bet_token)}{" "}
                ({Math.round(parseResolutionRates(market.admin_notes ?? null, market.bet_token).winners * 100)}% of {grandTotal.toFixed(decimals)})
              </p>
            </>
          ) : (
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-400">
              Pool resolved — payouts being processed.
            </p>
          )}
        </div>
      )}

      {/* Odds bars */}
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Live Odds</h2>
        {options.map((opt, idx) => {
          const isWinner = market.status === "resolved" && market.winning_option_id === opt.id;
          const col = optionColor(idx, opt.label);
          return (
            <div key={opt.id} className={`flex flex-col gap-1 ${market.status === "resolved" && !isWinner ? "opacity-50" : ""}`}>
              <div className="flex justify-between text-sm">
                <span className={`font-medium ${isWinner ? `font-bold ${col.winner}` : "text-foreground"}`}>
                  {opt.label} {isWinner && "🏆"}
                </span>
                <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
                  {pcts[opt.id]}% · {impliedOdds(pcts[opt.id])} ·
                  <TokenLogo token={market.bet_token} className="size-3" />
                  {totals[opt.id].toFixed(decimals)}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
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
        <PredictForm
          market={market}
          options={options}
          pcts={pcts}
          onRequestConnect={() => setShowWalletDialog(true)}
        />
      </div>

      {/* Recent predictions */}
      <div className="mb-10 rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Recent Predictions</h2>
        {bets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No predictions yet. Be the first!</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {bets.slice(0, 30).map((bet, i) => {
              const optLabel = options.find(o => o.id === bet.option_id)?.label ?? bet.option_id;
              // Bug #10 fix: stable key using created_at + option_id + index fallback
              const key = `${bet.created_at}-${bet.option_id}-${i}`;
              return (
                <div key={key} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                  {bet.wallet_address && (
                    <span className="font-mono text-muted-foreground">{truncWallet(bet.wallet_address)}</span>
                  )}
                  <span className="font-semibold text-foreground">{optLabel}</span>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
                      <TokenLogo token={market.bet_token} className="size-3" />
                      {Number(bet.amount).toFixed(decimals)}
                    </span>
                    {bet.payout_amount != null && (
                      <span className={`flex items-center gap-0.5 tabular-nums text-[11px] font-semibold ${bet.paid_at ? "text-emerald-600" : "text-orange-500"}`}>
                        {bet.paid_at ? "✓ Paid " : "→ "}
                        <TokenLogo token={market.bet_token} className="size-2.5" />
                        {Number(bet.payout_amount).toFixed(decimals)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Comments */}
      {/* Bug #5 fix: isAuthenticated based on walletAddress from auth context (already correct — 
          walletAddress is null when disconnected, set on connect) */}
      <div className="rounded-2xl border border-border bg-card p-5">
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

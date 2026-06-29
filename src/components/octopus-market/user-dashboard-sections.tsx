import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Coins, Copy, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  readAIListings,
  subscribeToAIListings,
  type AIListingSubmission,
} from "@/components/octopus-market/ai-listing-store";
import type { RegistryWalletRecord } from "@/components/octopus-market/octopus-central-registry";
import {
  readCentralPaymentRecords,
  subscribeToCentralRegistry,
  type RegistryPaymentRecord,
} from "@/components/octopus-market/octopus-central-registry";
import {
  readPredictionHistory,
  subscribeToPredictionMarketStorage,
  claimPredictionEntry,
  type PredictionHistoryEntry,
} from "@/components/octopus-market/prediction-market-store";
import { OctopusAIListingDialog } from "@/components/octopus-market/octopus-ai-listing-dialog";
import type { OctopusTokenBoardItem } from "@/components/octopus-market/octopus-market-data";
import {
  getOrCreateReferralCode,
  getOctoBreakdown,
  getReferrals,
  getReferralCommissionBalance,
  getReferralCommissionsByReferred,
  claimReferralCommissions,
} from "@/services/supabase/octo-service";
import type { ReferralRow } from "@/lib/supabase-types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DashboardSectionId = "wallet" | "bets" | "gains" | "listed-ai" | "token-launch";

type UserDashboardSectionsProps = {
  walletAddress: string | null;
  walletRecord: RegistryWalletRecord | null;
  launchedTokens: OctopusTokenBoardItem[];
  onConnectWallet: () => Promise<string | null>;
  visibleSections?: DashboardSectionId[];
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatClawdTrust(amount: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(amount)} ClawdTrust`;
}

function formatMoment(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function UserDashboardSections({
  walletAddress,
  walletRecord,
  launchedTokens,
  onConnectWallet,
  visibleSections,
}: UserDashboardSectionsProps) {
  const [aiRefreshIndex, setAiRefreshIndex] = useState(0);
  const [adminRefreshIndex, setAdminRefreshIndex] = useState(0);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [paymentRecords, setPaymentRecords] = useState<RegistryPaymentRecord[]>([]);
  const [betRecords, setBetRecords] = useState<PredictionHistoryEntry[]>([]);

  // OCTO Rewards
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [octoBreakdown, setOctoBreakdown] = useState({ referral: 0, bet: 0, total: 0 });
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);

  // Commission state (USDC + CLT)
  const [usdcBalance, setUsdcBalance] = useState({ available: 0, total_earned: 0, pending_claim: 0, available_clt: 0, total_earned_clt: 0, pending_claim_clt: 0 });
  const [commissionsByReferred, setCommissionsByReferred] = useState<Record<string, { usdc: number; clt: number }>>({});
  const [isClaiming, setIsClaiming] = useState(false);
  const [activeTab, setActiveTab] = useState<"bets" | "winnings" | "rewards">("bets");

  useEffect(() => {
    return subscribeToAIListings(() => {
      setAiRefreshIndex((currentValue) => currentValue + 1);
    });
  }, []);

  useEffect(() => {
    const loadPayments = () => {
      setPaymentRecords(readCentralPaymentRecords());
    };

    loadPayments();

    const unsubRegistry = subscribeToCentralRegistry(() => {
      loadPayments();
      setAdminRefreshIndex((currentValue) => currentValue + 1);
    });

    const unsubPrediction = subscribeToPredictionMarketStorage(() => {
      setBetRecords([...readPredictionHistory()]);
    });

    // Charge les paris depuis le cache (déjà populé par initPredictionStore)
    setBetRecords([...readPredictionHistory()]);

    return () => {
      unsubRegistry();
      unsubPrediction();
    };
  }, []);

  const predictionHistory = useMemo(() => {
    if (!walletAddress) {
      return [];
    }

    return betRecords.filter((entry) => entry.walletAddress === walletAddress);
  }, [betRecords, walletAddress]);

  const paymentNotifications = useMemo(() => paymentRecords, [paymentRecords, adminRefreshIndex]);
  const aiListings = useMemo<AIListingSubmission[]>(() => {
    if (!walletAddress) {
      return [];
    }

    return readAIListings().filter((listing) => listing.walletAddress === walletAddress);
  }, [aiRefreshIndex, walletAddress]);

  const derivedHistory = useMemo(
    () =>
      predictionHistory.map((entry) => {
        const payment = paymentNotifications.find((item) => item.paymentReference === entry.paymentReference);
        const canClaim =
          Boolean(walletAddress) &&
          walletAddress === entry.walletAddress &&
          entry.resultStatus === "win" &&
          !entry.claimedAt;

        return {
          ...entry,
          adminStatus: payment?.status ?? "pending",
          statusLabel:
            entry.resultStatus === "paid"
              ? "Paid"
              : entry.resultStatus === "claimed"
                ? "Claimed"
                : entry.resultStatus === "win"
                  ? "Win"
                  : entry.resultStatus === "lose"
                    ? "Lose"
                    : entry.resultStatus === "rejected"
                      ? "Rejected"
                      : entry.resultStatus === "approved_pending_result"
                        ? "Approved"
                        : "Pending review",
          canClaim,
        };
      }),
    [paymentNotifications, predictionHistory, walletAddress]
  );

  const totals = useMemo(() => {
    return derivedHistory.reduce(
      (summary, entry) => {
        if (entry.statusLabel === "Rejected") return summary;
        const isClt = entry.token === "clawdtrust";
        const isWon = entry.statusLabel === "Win" || entry.statusLabel === "Claimed" || entry.statusLabel === "Paid";
        const isLost = entry.statusLabel === "Lose";
        return {
          totalBets: summary.totalBets + (isClt ? 0 : entry.amount),
          totalBetsClt: summary.totalBetsClt + (isClt ? entry.amount : 0),
          totalWins: summary.totalWins + (!isClt && isWon ? entry.netReward : 0),
          totalWinsClt: summary.totalWinsClt + (isClt && isWon ? entry.netReward : 0),
          totalLosses: summary.totalLosses + (!isClt && isLost ? entry.totalCharged : 0),
          totalLossesClt: summary.totalLossesClt + (isClt && isLost ? entry.totalCharged : 0),
          claimable: summary.claimable + (!isClt && entry.canClaim ? entry.netReward : 0),
          claimableClt: summary.claimableClt + (isClt && entry.canClaim ? entry.netReward : 0),
        };
      },
      { totalBets: 0, totalBetsClt: 0, totalWins: 0, totalWinsClt: 0, totalLosses: 0, totalLossesClt: 0, claimable: 0, claimableClt: 0 }
    );
  }, [derivedHistory]);

  // Load OCTO + USDC commission data when wallet changes
  useEffect(() => {
    if (!walletAddress) {
      setReferralCode(null);
      setOctoBreakdown({ referral: 0, bet: 0, total: 0 });
      setReferrals([]);
      setUsdcBalance({ available: 0, total_earned: 0, pending_claim: 0, available_clt: 0, total_earned_clt: 0, pending_claim_clt: 0 });
      setCommissionsByReferred({});
      return;
    }
    void getOrCreateReferralCode(walletAddress).then((code) => setReferralCode(code));
    void getOctoBreakdown(walletAddress).then((bd) => setOctoBreakdown(bd));
    void getReferrals(walletAddress).then((rows) => setReferrals(rows));
    void getReferralCommissionBalance(walletAddress).then((bal) => setUsdcBalance(bal));
    void getReferralCommissionsByReferred(walletAddress).then((map) => setCommissionsByReferred(map));
  }, [walletAddress]);

  const allowedSections = useMemo<DashboardSectionId[]>(() => {
    if (visibleSections && visibleSections.length > 0) {
      return visibleSections;
    }

    return ["wallet", "bets", "gains", "listed-ai", "token-launch"];
  }, [visibleSections]);

  const showSection = (sectionId: DashboardSectionId) => allowedSections.includes(sectionId);

  const handleClaim = async (entryId: string) => {
    const targetEntry = derivedHistory.find((entry) => entry.id === entryId);

    if (!targetEntry?.canClaim) {
      return;
    }

    try {
      setClaimingId(entryId);
      const claimReference = `CLAIM-${Date.now().toString(36).toUpperCase()}`;
      await claimPredictionEntry(entryId, claimReference);
      toast.success("Reward claimed", {
        description: `${targetEntry.marketTitle} — pending admin payment.`,
        duration: 5000,
      });
    } catch {
      toast.error("Claim failed", { description: "Please try again or contact the admin." });
    } finally {
      setClaimingId(null);
    }
  };

  const handleClaimUsdc = async () => {
    if (!walletAddress || (usdcBalance.available <= 0 && usdcBalance.available_clt <= 0) || isClaiming) return;
    try {
      setIsClaiming(true);
      const res = await claimReferralCommissions(walletAddress);
      if (res.success) {
        const parts: string[] = [];
        if ((res.total_usdc ?? 0) > 0) parts.push(`$${(res.total_usdc ?? 0).toFixed(4)} USDC`);
        if ((res.total_clt ?? 0) > 0) parts.push(`${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(res.total_clt ?? 0)} ClawdTrust`);
        toast.success("Claim submitted", {
          description: `${parts.join(" + ")} — pending admin payment.`,
          duration: 5000,
        });
        // Refresh balance
        void getReferralCommissionBalance(walletAddress).then((bal) => setUsdcBalance(bal));
      } else if (res.already_pending) {
        toast.info("A claim is already pending", { description: "Wait for admin to process your current request." });
      } else {
        toast.error("Claim failed", { description: res.error ?? "Try again later." });
      }
    } catch {
      toast.error("Claim failed", { description: "Unexpected error. Try again." });
    } finally {
      setIsClaiming(false);
    }
  };

  if (!walletAddress) {
    return (
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Card className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-white/5 dark:text-white">
            <CardHeader>
              <CardTitle className="text-2xl">Connect your wallet to open your dashboard</CardTitle>
              <CardDescription>
                My Bets, My Winnings, My Listed AI, and Wallet Dashboard become available after the wallet is connected.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="rounded-2xl bg-orange-500 text-white hover:bg-orange-400" onClick={() => void onConnectWallet()}>
                <Wallet className="size-4" />
                Connect wallet
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section className="border-y border-orange-100 bg-orange-50/70 py-4 sm:py-8 dark:border-white/10 dark:bg-zinc-900/70">
      <div className="mx-auto max-w-7xl space-y-6 px-3 sm:px-6 lg:px-8">
        {showSection("wallet") ? (
          <div id="wallet-dashboard" className="scroll-mt-28">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3 pb-2 border-b border-zinc-200 dark:border-white/10">
                <div>
                  <p className="text-base font-semibold text-zinc-950 dark:text-white">{walletRecord?.displayName || walletRecord?.username || "Unnamed"}</p>
                  <p className="text-xs text-zinc-700 dark:text-zinc-400 font-mono break-all mt-0.5">{walletAddress}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {walletRecord?.twitterHandle && (
                    <span className="text-xs text-zinc-700 dark:text-zinc-400">@{walletRecord.twitterHandle.replace(/^@/, "")}</span>
                  )}
                  <Badge className="border border-orange-200 bg-white text-zinc-700 hover:bg-white dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-900">
                    {walletRecord?.status === "suspended" ? "Suspended" : "Active"}
                  </Badge>
                </div>
              </div>

              <div className="space-y-6">
                {/* ── Balance ── */}
                <div>
                  <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-400">Balance</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                      <img src="/clawdtrust-coin.png" alt="ClawdTrust" className="size-9 shrink-0 object-contain" />
                      <span className="text-base font-semibold text-zinc-950 dark:text-white">
                        {new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(totals.claimableClt + usdcBalance.available_clt)} ClawdTrust
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                      <img src="/octo-coin.png" alt="OCTO" className="size-9 shrink-0 object-contain" />
                      <span className="text-base font-semibold text-zinc-950 dark:text-white">
                        {octoBreakdown.total.toLocaleString()} OCTO
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                      <img src="/usdc-coin.png" alt="USDC" className="size-9 shrink-0 object-contain" />
                      <span className="text-base font-semibold text-zinc-950 dark:text-white">
                        {formatCurrency(totals.claimable + usdcBalance.available)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Tab bar ── */}
                <div className="flex gap-1 rounded-2xl border border-orange-100 bg-orange-50 p-1 dark:border-white/10 dark:bg-black/20">
                  {(["bets", "winnings", "rewards"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={[
                        "flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm",
                        activeTab === tab
                          ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white"
                          : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
                      ].join(" ")}
                    >
                      {tab === "bets" ? "My Bets" : tab === "winnings" ? "My Winnings" : "Rewards"}
                    </button>
                  ))}
                </div>

                {/* ── Bets tab ── */}
                {activeTab === "bets" && (
                  <div className="space-y-4">
                    {derivedHistory.length > 0 ? (
                      derivedHistory.map((entry) => (
                        <div key={entry.id} className="rounded-2xl border border-orange-100 bg-orange-50/80 p-4 dark:border-white/10 dark:bg-black/20">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-zinc-950 dark:text-white">{entry.marketTitle}</p>
                              <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-400">
                                {entry.categoryLabel} · {entry.selectionLabel} · {formatMoment(entry.createdAt)}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className={entry.token === "clawdtrust"
                                ? "border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-50 dark:border-purple-400/20 dark:bg-purple-500/15 dark:text-purple-300 dark:hover:bg-purple-500/15"
                                : "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50 dark:border-blue-400/20 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-500/15"
                              }>
                                {entry.token === "clawdtrust" ? "ClawdTrust" : "USDC"}
                              </Badge>
                              <Badge className={
                                entry.statusLabel === "Win" || entry.statusLabel === "Claimed" || entry.statusLabel === "Paid"
                                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                                  : entry.statusLabel === "Lose" || entry.statusLabel === "Rejected"
                                    ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-50 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/10"
                                    : "border border-orange-200 bg-white text-orange-700 hover:bg-white dark:border-white/10 dark:bg-zinc-950 dark:text-orange-300 dark:hover:bg-zinc-950"
                              }>
                                {entry.statusLabel}
                              </Badge>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2 text-sm text-zinc-700 dark:text-zinc-300 grid-cols-2 xl:grid-cols-4">
                            <div>Bet amount: {entry.token === "clawdtrust" ? formatClawdTrust(entry.amount) : formatCurrency(entry.amount)}</div>
                            <div>Reserve fee: {entry.token === "clawdtrust" ? formatClawdTrust(entry.reserveFee) : formatCurrency(entry.reserveFee)}</div>
                            <div>Total paid: {entry.token === "clawdtrust" ? formatClawdTrust(entry.totalCharged) : formatCurrency(entry.totalCharged)}</div>
                            <div>Odds: x{entry.payoutMultiple}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-orange-200 bg-white p-4 text-sm text-zinc-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-400">
                        No bets recorded yet.
                      </div>
                    )}
                  </div>
                )}

                {/* ── Winnings tab ── */}
                {activeTab === "winnings" && (
                  <div className="space-y-4">
                    {/* ── Stat rows ── */}
                    <div className="space-y-4">

                      {/* Total bet volume */}
                      <div>
                        <p className="mb-2 text-xs uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Total bet volume</p>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                            <div className="flex items-center gap-2">
                              <img src="/clawdtrust-coin.png" alt="ClawdTrust" className="size-5 shrink-0 object-contain" />
                              <span className="text-sm text-zinc-600 dark:text-zinc-400">ClawdTrust</span>
                            </div>
                            <span className="text-sm font-semibold text-zinc-950 dark:text-white">{formatClawdTrust(totals.totalBetsClt)}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                            <div className="flex items-center gap-2">
                              <img src="/usdc-coin.png" alt="USDC" className="size-5 shrink-0 object-contain" />
                              <span className="text-sm text-zinc-600 dark:text-zinc-400">USDC</span>
                            </div>
                            <span className="text-sm font-semibold text-zinc-950 dark:text-white">{formatCurrency(totals.totalBets)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Total win */}
                      <div>
                        <p className="mb-2 text-xs uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Total win</p>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                            <div className="flex items-center gap-2">
                              <img src="/clawdtrust-coin.png" alt="ClawdTrust" className="size-5 shrink-0 object-contain" />
                              <span className="text-sm text-emerald-700 dark:text-emerald-400">ClawdTrust</span>
                            </div>
                            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{formatClawdTrust(totals.totalWinsClt)}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                            <div className="flex items-center gap-2">
                              <img src="/usdc-coin.png" alt="USDC" className="size-5 shrink-0 object-contain" />
                              <span className="text-sm text-emerald-700 dark:text-emerald-400">USDC</span>
                            </div>
                            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{formatCurrency(totals.totalWins)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Total loss */}
                      <div>
                        <p className="mb-2 text-xs uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Total loss</p>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/20 dark:bg-red-500/10">
                            <div className="flex items-center gap-2">
                              <img src="/clawdtrust-coin.png" alt="ClawdTrust" className="size-5 shrink-0 object-contain" />
                              <span className="text-sm text-red-700 dark:text-red-400">ClawdTrust</span>
                            </div>
                            <span className="text-sm font-semibold text-red-700 dark:text-red-300">{formatClawdTrust(totals.totalLossesClt)}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/20 dark:bg-red-500/10">
                            <div className="flex items-center gap-2">
                              <img src="/usdc-coin.png" alt="USDC" className="size-5 shrink-0 object-contain" />
                              <span className="text-sm text-red-700 dark:text-red-400">USDC</span>
                            </div>
                            <span className="text-sm font-semibold text-red-700 dark:text-red-300">{formatCurrency(totals.totalLosses)}</span>
                          </div>
                        </div>
                      </div>

                    </div>
                    {derivedHistory.filter((entry) => entry.canClaim || entry.claimedAt || entry.payoutStatus === "paid").length > 0 ? (
                      derivedHistory
                        .filter((entry) => entry.canClaim || entry.claimedAt || entry.payoutStatus === "paid")
                        .map((entry) => (
                          <div key={entry.id} className="rounded-2xl border border-orange-100 bg-orange-50/80 p-4 dark:border-white/10 dark:bg-black/20">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-zinc-950 dark:text-white">{entry.marketTitle}</p>
                                <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-400">
                                  Net reward {entry.token === "clawdtrust" ? formatClawdTrust(entry.netReward) : formatCurrency(entry.netReward)} · Won on {entry.winningChoiceLabel ?? entry.selectionLabel} · {formatMoment(entry.resolvedAt ?? entry.createdAt)}
                                </p>
                              </div>
                              {entry.canClaim ? (
                                <Button
                                  type="button"
                                  className="rounded-2xl bg-orange-500 text-white hover:bg-orange-400"
                                  disabled={claimingId === entry.id}
                                  onClick={() => void handleClaim(entry.id)}
                                >
                                  {claimingId === entry.id ? "Claiming..." : "Claim"}
                                </Button>
                              ) : entry.payoutStatus === "paid" ? (
                                <Badge className="border border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-200 dark:hover:bg-emerald-500/20">
                                  Paid ✓
                                </Badge>
                              ) : (
                                <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/10">
                                  Claimed — pending payment
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-orange-200 bg-white p-4 text-sm text-zinc-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-400">
                        No winnings are available yet.
                      </div>
                    )}
                  </div>
                )}

                {/* ── Rewards tab ── */}
                {activeTab === "rewards" && (
                  <div className="space-y-8">
                    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                      <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4 dark:border-white/10 dark:bg-black/20">
                        <img src="/octo-coin.png" alt="OCTO" className="size-5 shrink-0 object-contain" />
                        <div>
                          <p className="text-xs uppercase tracking-[0.14em] text-zinc-700 dark:text-zinc-400">From referrals</p>
                          <p className="mt-1 text-xl font-bold text-zinc-950 dark:text-white">{octoBreakdown.referral.toLocaleString()} OCTO</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4 dark:border-white/10 dark:bg-black/20">
                        <img src="/octo-coin.png" alt="OCTO" className="size-5 shrink-0 object-contain" />
                        <div>
                          <p className="text-xs uppercase tracking-[0.14em] text-zinc-700 dark:text-zinc-400">From bets</p>
                          <p className="mt-1 text-xl font-bold text-zinc-950 dark:text-white">{octoBreakdown.bet.toLocaleString()} OCTO</p>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                        <p className="text-xs uppercase tracking-[0.14em] text-zinc-700 dark:text-zinc-400">Commissions</p>
                        {/* USDC */}
                        <div className="mt-3 flex items-center gap-3">
                          <img src="/usdc-coin.png" alt="USDC" className="size-5 shrink-0 object-contain" />
                          <div className="flex-1 min-w-0">
                            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">${usdcBalance.total_earned.toFixed(4)} USDC</p>
                            {usdcBalance.pending_claim > 0 ? (
                              <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">${usdcBalance.pending_claim.toFixed(4)} pending payment</p>
                            ) : usdcBalance.available > 0 ? (
                              <button
                                type="button"
                                onClick={() => void handleClaimUsdc()}
                                disabled={isClaiming}
                                className="mt-1.5 rounded-xl bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                              >
                                {isClaiming ? "Submitting…" : `Claim $${usdcBalance.available.toFixed(4)}`}
                              </button>
                            ) : (
                              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">No available balance</p>
                            )}
                          </div>
                        </div>
                        {/* CLT */}
                        <div className="mt-3 flex items-center gap-3 border-t border-emerald-100 pt-3 dark:border-emerald-500/20">
                          <img src="/clawdtrust-coin.png" alt="CLT" className="size-5 shrink-0 object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display="none"; }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                              {new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(usdcBalance.total_earned_clt)} ClawdTrust
                            </p>
                            {usdcBalance.pending_claim_clt > 0 ? (
                              <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                                {new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(usdcBalance.pending_claim_clt)} ClawdTrust pending payment
                              </p>
                            ) : usdcBalance.available_clt > 0 ? (
                              <button
                                type="button"
                                onClick={() => void handleClaimUsdc()}
                                disabled={isClaiming}
                                className="mt-1.5 rounded-xl bg-purple-600 px-3 py-1 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
                              >
                                {isClaiming ? "Submitting…" : `Claim ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(usdcBalance.available_clt)} ClawdTrust`}
                              </button>
                            ) : (
                              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">No available balance</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-sm font-semibold text-zinc-950 dark:text-white">Your referral link</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 truncate rounded-2xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-mono text-zinc-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                          {referralCode ? `${window.location.origin}?ref=${referralCode}` : "Generating your code…"}
                        </div>
                        <button
                          type="button"
                          disabled={!referralCode}
                          onClick={() => {
                            if (!referralCode) return;
                            void navigator.clipboard.writeText(`${window.location.origin}?ref=${referralCode}`).then(() => {
                              setCopiedLink(true);
                              setTimeout(() => setCopiedLink(false), 2000);
                            });
                          }}
                          className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-400 disabled:opacity-50"
                        >
                          {copiedLink ? (
                            <><CheckCircle2 className="size-4" /> Copied!</>
                          ) : (
                            <><Copy className="size-4" /> Copy link</>
                          )}
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-400">
                        You earn <span className="font-semibold text-orange-600 dark:text-orange-300">10 OCTO</span> for each friend who connects their wallet via your link.
                      </p>
                    </div>

                    <div>
                      <p className="mb-3 text-sm font-semibold text-zinc-950 dark:text-white">
                        Referral activity · {referrals.length} friend{referrals.length !== 1 ? "s" : ""} referred
                      </p>
                      {referrals.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/60 px-5 py-6 text-center text-sm text-zinc-500 dark:border-white/10 dark:bg-black/20 dark:text-zinc-400">
                          No referrals yet — share your link to start earning OCTO.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-2xl border border-orange-200 dark:border-white/10">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-orange-200 bg-orange-50 dark:border-white/10 dark:bg-zinc-900">
                                <TableHead className="text-xs font-semibold text-zinc-800 dark:text-zinc-400">User</TableHead>
                                <TableHead className="text-xs font-semibold text-zinc-800 dark:text-zinc-400">Joined</TableHead>
                                <TableHead className="text-xs font-semibold text-zinc-800 dark:text-zinc-400">OCTO earned</TableHead>
                                <TableHead className="text-xs font-semibold text-zinc-800 dark:text-zinc-400">USDC earned</TableHead>
                                <TableHead className="text-xs font-semibold text-zinc-800 dark:text-zinc-400">ClawdTrust earned</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {referrals.map((row) => (
                                <TableRow key={row.id} className="border-orange-100 dark:border-white/10">
                                  <TableCell className="py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                                    {row.referred_wallet.slice(0, 6)}…{row.referred_wallet.slice(-4)}
                                  </TableCell>
                                  <TableCell className="py-3 text-xs text-zinc-600 dark:text-zinc-400">
                                    {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(row.created_at))}
                                  </TableCell>
                                  <TableCell className="py-3">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                                      +10 OCTO
                                    </span>
                                  </TableCell>
                                  <TableCell className="py-3">
                                    {(commissionsByReferred[row.referred_wallet]?.usdc ?? 0) > 0 ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                                        +${commissionsByReferred[row.referred_wallet]!.usdc.toFixed(4)} USDC
                                      </span>
                                    ) : (
                                      <span className="text-xs text-zinc-600">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="py-3">
                                    {(commissionsByReferred[row.referred_wallet]?.clt ?? 0) > 0 ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                                        +{new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(commissionsByReferred[row.referred_wallet]!.clt)} ClawdTrust
                                      </span>
                                    ) : (
                                      <span className="text-xs text-zinc-600">—</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        ) : null}

        {showSection("listed-ai") ? (
          <div id="my-listed-ai" className="scroll-mt-28">
            <Card className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-white/5 dark:text-white">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-2xl">My Listed AI</CardTitle>
                    <CardDescription>
                      Review your submitted AI products and start a new submission if you have not listed one yet.
                    </CardDescription>
                  </div>
                  <OctopusAIListingDialog
                    walletAddress={walletAddress}
                    walletRecord={walletRecord}
                    onConnectWallet={onConnectWallet}
                    triggerLabel="List my AI"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {aiListings.length > 0 ? (
                  aiListings.map((listing) => (
                    <div key={listing.id} className="rounded-2xl border border-orange-100 bg-orange-50/80 p-4 dark:border-white/10 dark:bg-black/20">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <img src={listing.iconSrc} alt={listing.displayName} className="size-12 rounded-2xl object-cover" />
                          <div>
                            <p className="font-semibold text-zinc-950 dark:text-white">{listing.displayName}</p>
                            <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-400">{listing.twitterHandle}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge className="border border-orange-200 bg-white text-orange-700 hover:bg-white dark:border-white/10 dark:bg-zinc-950 dark:text-orange-300 dark:hover:bg-zinc-950">
                            {listing.planId}
                          </Badge>
                          <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                            {listing.status}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-zinc-700 dark:text-zinc-300 grid-cols-2 xl:grid-cols-4">
                        <div>Billing: {listing.billingLabel}</div>
                        <div>Visitors: {listing.visitorCount}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-orange-200 bg-white p-4 text-sm text-zinc-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-400">
                    No AI submitted yet. Use the button above to start Step 1 and Step 2 of the listing flow.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {showSection("token-launch") ? (
          <div id="my-token-launch" className="scroll-mt-28">
            <Card className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-white/5 dark:text-white">
              <CardHeader>
                <CardTitle className="text-2xl">My Token Launches</CardTitle>
                <CardDescription>
                  Tokens launched from this wallet appear here with their logo and token name.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {launchedTokens.length > 0 ? (
                  launchedTokens.map((token) => (
                    <div key={token.id} className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50/80 p-4 dark:border-white/10 dark:bg-black/20">
                      {token.logoSrc ? (
                        <img src={token.logoSrc} alt={token.name} className="size-10 rounded-full object-cover" />
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300">
                          <Coins className="size-4" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-zinc-950 dark:text-white">{token.name}</p>
                        <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-400">{token.ticker}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-orange-200 bg-white p-4 text-sm text-zinc-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-400">
                    No token launch recorded yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Coins, Copy, DollarSign, Gift, Star, Wallet } from "lucide-react";

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

  // USDC Commission state
  const [usdcBalance, setUsdcBalance] = useState({ available: 0, total_earned: 0, pending_claim: 0 });
  const [commissionsByReferred, setCommissionsByReferred] = useState<Record<string, number>>({});
  const [isClaiming, setIsClaiming] = useState(false);

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
      (summary, entry) => ({
        totalBets: summary.totalBets + entry.amount,
        totalWins: summary.totalWins + (entry.statusLabel === "Win" || entry.statusLabel === "Claimed" || entry.statusLabel === "Paid" ? entry.netReward : 0),
        totalLosses: summary.totalLosses + (entry.statusLabel === "Lose" ? entry.totalCharged : 0),
        claimable: summary.claimable + (entry.canClaim ? entry.netReward : 0),
      }),
      { totalBets: 0, totalWins: 0, totalLosses: 0, claimable: 0 }
    );
  }, [derivedHistory]);

  // Load OCTO + USDC commission data when wallet changes
  useEffect(() => {
    if (!walletAddress) {
      setReferralCode(null);
      setOctoBreakdown({ referral: 0, bet: 0, total: 0 });
      setReferrals([]);
      setUsdcBalance({ available: 0, total_earned: 0, pending_claim: 0 });
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
      toast.success("Gain réclamé", {
        description: `${targetEntry.marketTitle} — en attente de paiement admin.`,
        duration: 5000,
      });
    } catch {
      toast.error("Échec de la réclamation", { description: "Réessayez ou contactez l'admin." });
    } finally {
      setClaimingId(null);
    }
  };

  const handleClaimUsdc = async () => {
    if (!walletAddress || usdcBalance.available <= 0 || isClaiming) return;
    try {
      setIsClaiming(true);
      const res = await claimReferralCommissions(walletAddress);
      if (res.success) {
        toast.success("Claim submitted", {
          description: `$${res.total_usdc?.toFixed(4)} USDC — pending admin payment.`,
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
    <section className="border-y border-orange-100 bg-orange-50/70 py-20 dark:border-white/10 dark:bg-zinc-900/70">
      <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
        {showSection("wallet") ? (
          <div id="wallet-dashboard" className="scroll-mt-28">
            <Card className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-white/5 dark:text-white">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                    Wallet dashboard
                  </Badge>
                  <Badge className="border border-orange-200 bg-white text-zinc-700 hover:bg-white dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-900">
                    {walletRecord?.status === "suspended" ? "Suspended" : "Active"}
                  </Badge>
                </div>
                <CardTitle className="text-2xl">Wallet profile and access state</CardTitle>
                <CardDescription>
                  Your wallet identity, X profile, and current account status are tracked here after connection.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-4">
                <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Pseudo</p>
                  <p className="mt-2 font-semibold text-zinc-950 dark:text-white">{walletRecord?.displayName || walletRecord?.username || "Unnamed"}</p>
                </div>
                <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">X profile</p>
                  <p className="mt-2 font-semibold text-zinc-950 dark:text-white">{walletRecord?.twitterHandle || "Not added"}</p>
                </div>
                <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20 md:col-span-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Solana wallet</p>
                  <p className="mt-2 break-all font-semibold text-zinc-950 dark:text-white">{walletAddress}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* ── OCTO Rewards ──────────────────────────────────────────────────── */}
        <div id="octo-rewards" className="scroll-mt-28">
          <Card className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-white/5 dark:text-white">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-orange-100 dark:bg-orange-500/10">
                    <Star className="size-5 text-orange-500 dark:text-orange-300" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">OCTO Rewards</CardTitle>
                    <CardDescription className="mt-0.5">
                      Earn OCTO by referring friends and placing bets
                    </CardDescription>
                  </div>
                </div>
                {/* Total balance chip */}
                <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-3 dark:border-white/10 dark:bg-orange-500/10">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Total balance</p>
                  <p className="mt-1 text-3xl font-bold text-orange-600 dark:text-orange-300">
                    {octoBreakdown.total.toLocaleString()} <span className="text-lg font-semibold">OCTO</span>
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-8">

              {/* Breakdown */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4 dark:border-white/10 dark:bg-black/20">
                  <Gift className="size-5 shrink-0 text-orange-500 dark:text-orange-300" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">From referrals</p>
                    <p className="mt-1 text-xl font-bold text-zinc-950 dark:text-white">
                      {octoBreakdown.referral.toLocaleString()} OCTO
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4 dark:border-white/10 dark:bg-black/20">
                  <Coins className="size-5 shrink-0 text-orange-500 dark:text-orange-300" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">From bets</p>
                    <p className="mt-1 text-xl font-bold text-zinc-950 dark:text-white">
                      {octoBreakdown.bet.toLocaleString()} OCTO
                    </p>
                  </div>
                </div>
                {/* USDC Commission card */}
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                  <DollarSign className="size-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">USDC commissions</p>
                    <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300">
                      ${usdcBalance.total_earned.toFixed(4)}
                    </p>
                    {usdcBalance.pending_claim > 0 ? (
                      <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                        ${usdcBalance.pending_claim.toFixed(4)} pending payment
                      </p>
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
                      <p className="mt-0.5 text-xs text-zinc-400">No available balance</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Referral link */}
              <div>
                <p className="mb-2 text-sm font-semibold text-zinc-950 dark:text-white">Your referral link</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 truncate rounded-2xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-mono text-zinc-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                    {referralCode
                      ? `${window.location.origin}?ref=${referralCode}`
                      : "Generating your code…"}
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
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  You earn <span className="font-semibold text-orange-600 dark:text-orange-300">10 OCTO</span> for each friend who connects their wallet via your link.
                </p>
              </div>

              {/* Referral activity table */}
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
                          <TableHead className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">User</TableHead>
                          <TableHead className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Joined</TableHead>
                          <TableHead className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">OCTO earned</TableHead>
                          <TableHead className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">USDC earned</TableHead>
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
                              {commissionsByReferred[row.referred_wallet] ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                                  +${commissionsByReferred[row.referred_wallet]!.toFixed(4)} USDC
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-400">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

            </CardContent>
          </Card>
        </div>

        {showSection("bets") ? (
          <div id="my-bets" className="scroll-mt-28">
            <Card className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-white/5 dark:text-white">
              <CardHeader>
                <CardTitle className="text-2xl">My Bets</CardTitle>
                <CardDescription>
                  Review your payment history, selected side, odds, total charged amount, and deposit review status.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {derivedHistory.length > 0 ? (
                  derivedHistory.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-orange-100 bg-orange-50/80 p-4 dark:border-white/10 dark:bg-black/20">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-zinc-950 dark:text-white">{entry.marketTitle}</p>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {entry.categoryLabel} · {entry.selectionLabel} · {formatMoment(entry.createdAt)}
                          </p>
                        </div>
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
                      <div className="mt-3 grid gap-2 text-sm text-zinc-700 dark:text-zinc-300 sm:grid-cols-2 xl:grid-cols-4">
                        <div>Bet amount: {formatCurrency(entry.amount)}</div>
                        <div>Reserve fee: {formatCurrency(entry.reserveFee)}</div>
                        <div>Total paid: {formatCurrency(entry.totalCharged)}</div>
                        <div>Odds: x{entry.payoutMultiple}</div>
                        <div>Admin decision: {entry.adminDecisionStatus ?? "pending"}</div>
                        <div>Result from database: {entry.statusLabel}</div>
                        <div>Resolved at: {entry.resolvedAt ? formatMoment(entry.resolvedAt) : "Awaiting result"}</div>
                        <div>Winning choice: {entry.winningChoiceLabel ?? "Not a winning bet"}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-orange-200 bg-white p-4 text-sm text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-400">
                    No bets recorded yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {showSection("gains") ? (
          <div id="my-gains" className="scroll-mt-28">
            <Card className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-white/5 dark:text-white">
              <CardHeader>
                <CardTitle className="text-2xl">My Winnings</CardTitle>
                <CardDescription>
                  Follow your total wins, losses, claimable rewards, and claim actions after an admin-approved result.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Total bet volume</p>
                    <p className="mt-2 text-xl font-semibold text-zinc-950 dark:text-white">{formatCurrency(totals.totalBets)}</p>
                  </div>
                  <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Total win</p>
                    <p className="mt-2 text-xl font-semibold text-emerald-600 dark:text-emerald-300">{formatCurrency(totals.totalWins)}</p>
                  </div>
                  <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Total loss</p>
                    <p className="mt-2 text-xl font-semibold text-red-600 dark:text-red-300">{formatCurrency(totals.totalLosses)}</p>
                  </div>
                  <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Claimable now</p>
                    <p className="mt-2 text-xl font-semibold text-zinc-950 dark:text-white">{formatCurrency(totals.claimable)}</p>
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
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                              Net reward {formatCurrency(entry.netReward)} · Won on {entry.winningChoiceLabel ?? entry.selectionLabel} · {formatMoment(entry.resolvedAt ?? entry.createdAt)}
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
                  <div className="rounded-2xl border border-dashed border-orange-200 bg-white p-4 text-sm text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-400">
                    No winnings are available yet.
                  </div>
                )}
              </CardContent>
            </Card>
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
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{listing.twitterHandle}</p>
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
                      <div className="mt-3 grid gap-2 text-sm text-zinc-700 dark:text-zinc-300 sm:grid-cols-2 xl:grid-cols-4">
                        <div>Billing: {listing.billingLabel}</div>
                        <div>Visitors: {listing.visitorCount}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-orange-200 bg-white p-4 text-sm text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-400">
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
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{token.ticker}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-orange-200 bg-white p-4 text-sm text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-400">
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

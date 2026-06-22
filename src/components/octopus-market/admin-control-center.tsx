import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, CheckCircle2, Coins, ShieldCheck, Users, XCircle } from "lucide-react";

import { AdminPaymentsManualConfirm } from "@/components/octopus-market/admin-payments-manual-confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  appendAIListingSubmission,
  readAIListings,
  subscribeToAIListings,
  updateAIListingSubmission,
} from "@/components/octopus-market/ai-listing-store";
import {
  hydrateCentralRegistry,
  readCentralHistoryRecords,
  readCentralPaymentRecords,
  readCentralWalletRecords,
  subscribeToCentralRegistry,
  type RegistryHistoryRecord,
  type RegistryPaymentRecord,
  type RegistryWalletRecord,
} from "@/components/octopus-market/octopus-central-registry";
import {
  readAdminPaymentNotifications,
  readConnectedWalletSessions,
  syncAdminNotificationsFromTreasury,
  subscribeToAdminStorage,
  updateAdminPaymentNotificationStatus,
} from "@/components/octopus-market/octopus-admin";
import {
  readPredictionHistory,
  readPredictionResolutions,
  subscribeToPredictionMarketStorage,
  type PredictionHistoryEntry,
  type PredictionResolutionRecord,
} from "@/components/octopus-market/prediction-market-store";
import { getClaimedPredictions, markClaimAsPaid } from "@/services/supabase/prediction-service";
import { predictionMarketTreasuryAddress } from "@/components/octopus-market/octopus-market-data";
import { formatWalletAddress } from "@/components/octopus-market/solana-wallet";

type AdminControlCenterProps = {
  walletAddress: string | null;
};

type AdminPanelKey = "wallets" | "pending" | "approved" | "participants" | "claims";

type WalletActivitySummary = {
  address: string;
  walletRecord: RegistryWalletRecord;
  entries: RegistryHistoryRecord[];
  payments: RegistryPaymentRecord[];
  predictionCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalWon: number;
  totalLost: number;
  totalStaked: number;
};

type AdminWalletSummary = {
  address: string;
  connectedNow: boolean;
  lastActivityAt: number | null;
  receivedPaymentsCount: number;
  pendingReceivedCount: number;
  approvedReceivedCount: number;
  rejectedReceivedCount: number;
  totalReceivedUsdc: number;
  totalApprovedUsdc: number;
  totalPendingUsdc: number;
  reviewedPaymentsCount: number;
  resolvedMarketsCount: number;
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

function formatNotificationWalletLabel(notification: RegistryPaymentRecord, walletSummaryByAddress: Record<string, WalletActivitySummary>) {
  const walletSummary = walletSummaryByAddress[notification.userWallet];
  return walletSummary?.walletRecord.displayName || walletSummary?.walletRecord.username || notification.username || "Unknown wallet";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("file-read-error"));
    reader.readAsDataURL(file);
  });
}

export function AdminControlCenter({ walletAddress }: AdminControlCenterProps) {
  const [walletRecords, setWalletRecords] = useState<RegistryWalletRecord[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<RegistryPaymentRecord[]>([]);
  const [historyRecords, setHistoryRecords] = useState<RegistryHistoryRecord[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, PredictionResolutionRecord>>(() => readPredictionResolutions());
  const [claimsHistory, setClaimsHistory] = useState<PredictionHistoryEntry[]>([]);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [selectedPanel, setSelectedPanel] = useState<AdminPanelKey>("pending");
  const [aiListingRefreshIndex, setAIListingRefreshIndex] = useState(0);
  const [reviewActionByReference, setReviewActionByReference] = useState<Record<string, "approved" | "rejected">>({});
  const [showAdminListingForm, setShowAdminListingForm] = useState(false);
  const [adminListingStatusMessage, setAdminListingStatusMessage] = useState("Admin can publish an AI listing with 0 fee and make it visible immediately on the platform.");
  const [adminListingDraft, setAdminListingDraft] = useState({
    displayName: "",
    twitterHandle: "",
    websiteUrl: "",
    description: "",
    socialUrl: "",
    iconSrc: "",
    iconName: "",
    guideFileName: "",
    guideFileUrl: "",
  });

  const loadCentralData = useCallback(async () => {
    const [nextWalletRecords, nextPaymentRecords, nextHistoryRecords] = await Promise.all([
      readCentralWalletRecords(),
      readCentralPaymentRecords(),
      readCentralHistoryRecords(),
    ]);

    setWalletRecords(nextWalletRecords);
    setPaymentRecords(nextPaymentRecords);
    setHistoryRecords(nextHistoryRecords);
  }, []);

  const loadClaims = useCallback(async () => {
    const rows = await getClaimedPredictions();
    // Convertir les rows DB en PredictionHistoryEntry (shape minimale pour l'affichage)
    setClaimsHistory(
      rows.map((row) => ({
        id: row.id,
        marketId: row.market_id,
        marketTitle: row.market_title,
        categoryLabel: row.category_label,
        selectionId: row.selection_id,
        selectionLabel: row.selection_label,
        amount: Number(row.amount),
        reserveFee: Number(row.reserve_fee),
        totalCharged: Number(row.total_charged),
        claimFeeRate: Number(row.claim_fee_rate),
        payoutMultiple: Number(row.payout_multiple),
        grossReward: Number(row.gross_reward),
        netReward: Number(row.net_reward),
        walletAddress: row.wallet_address,
        paymentReference: row.payment_reference,
        paymentRequestId: row.payment_request_id,
        createdAt: new Date(row.created_at).getTime(),
        reportedAt: new Date(row.reported_at).getTime(),
        claimedAt: row.claimed_at ? new Date(row.claimed_at).getTime() : undefined,
        claimReference: row.claim_reference ?? undefined,
        payoutStatus: row.payout_status ?? undefined,
        paidAt: row.paid_at ? new Date(row.paid_at).getTime() : undefined,
        paidByWallet: row.paid_by_wallet ?? undefined,
      }))
    );
  }, []);

  useEffect(() => {
    void hydrateCentralRegistry({
      wallets: readConnectedWalletSessions(),
      payments: readAdminPaymentNotifications(),
      history: readPredictionHistory(),
    }).then(loadCentralData);
    void loadClaims();
  }, [loadCentralData, loadClaims]);

  useEffect(() => {
    return subscribeToCentralRegistry(() => {
      void loadCentralData();
    });
  }, [loadCentralData]);

  useEffect(() => {
    return subscribeToAdminStorage(() => {
      void hydrateCentralRegistry({
        wallets: readConnectedWalletSessions(),
        payments: readAdminPaymentNotifications(),
      }).then(loadCentralData);
    });
  }, [loadCentralData]);

  useEffect(() => {
    return subscribeToPredictionMarketStorage(() => {
      setResolutions(readPredictionResolutions());
      void loadClaims();
      void hydrateCentralRegistry({ history: readPredictionHistory() }).then(loadCentralData);
    });
  }, [loadCentralData, loadClaims]);

  useEffect(() => {
    return subscribeToAIListings(() => {
      setAIListingRefreshIndex((currentValue) => currentValue + 1);
    });
  }, []);

  useEffect(() => {
    if (!walletAddress || walletAddress !== predictionMarketTreasuryAddress) {
      return;
    }

    const syncTreasuryPayments = () => {
      void syncAdminNotificationsFromTreasury(walletAddress).then(() => {
        void hydrateCentralRegistry({ payments: readAdminPaymentNotifications() }).then(loadCentralData);
      });
    };

    const handleVisibilitySync = () => {
      if (!document.hidden) {
        syncTreasuryPayments();
      }
    };

    syncTreasuryPayments();
    const intervalId = window.setInterval(syncTreasuryPayments, 12000);
    window.addEventListener("focus", handleVisibilitySync);
    document.addEventListener("visibilitychange", handleVisibilitySync);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilitySync);
      document.removeEventListener("visibilitychange", handleVisibilitySync);
    };
  }, [loadCentralData, walletAddress]);

  const isAdminWallet = walletAddress === predictionMarketTreasuryAddress;

  const pendingNotifications = useMemo(
    () => paymentRecords.filter((notification) => notification.status === "pending"),
    [paymentRecords]
  );
  const approvedNotifications = useMemo(
    () => paymentRecords.filter((notification) => notification.status === "approved"),
    [paymentRecords]
  );
  const rejectedNotifications = useMemo(
    () => paymentRecords.filter((notification) => notification.status === "rejected"),
    [paymentRecords]
  );
  const predictionParticipants = useMemo(
    () =>
      paymentRecords.filter(
        (notification) => notification.flow === "prediction" && notification.userWallet !== predictionMarketTreasuryAddress
      ),
    [paymentRecords]
  ); 
  const walletSummaries = useMemo<WalletActivitySummary[]>(() => {
    return walletRecords
      .filter((walletRecord) => walletRecord.address !== predictionMarketTreasuryAddress)
      .map((walletRecord) => {
        const entries = historyRecords.filter((entry) => entry.walletAddress === walletRecord.address);
        const payments = paymentRecords.filter((payment) => payment.userWallet === walletRecord.address);
        const approvedReferences = new Set(
          payments.filter((payment) => payment.status === "approved").map((payment) => payment.paymentReference)
        );
        const rejectedReferences = new Set(
          payments.filter((payment) => payment.status === "rejected").map((payment) => payment.paymentReference)
        );

        const totalWon = entries.reduce((total, entry) => {
          if (approvedReferences.has(entry.paymentReference) && entry.claimedAt) {
            return total + entry.netReward;
          }

          return total;
        }, 0);
        const totalLost = entries.reduce((total, entry) => {
          if (rejectedReferences.has(entry.paymentReference)) {
            return total + entry.totalCharged;
          }

          const resolution = resolutions[entry.marketId];
          const payment = payments.find((item) => item.paymentReference === entry.paymentReference);

          if (payment?.status === "approved" && resolution && resolution.outcomeId !== entry.selectionId) {
            return total + entry.totalCharged;
          }

          return total;
        }, 0);

        return {
          address: walletRecord.address,
          walletRecord,
          entries,
          payments,
          predictionCount: payments.filter((payment) => payment.flow === "prediction").length,
          pendingCount: payments.filter((payment) => payment.status === "pending").length,
          approvedCount: payments.filter((payment) => payment.status === "approved").length,
          rejectedCount: payments.filter((payment) => payment.status === "rejected").length,
          totalWon,
          totalLost,
          totalStaked: entries.reduce((total, entry) => total + entry.amount, 0),
        };
      })
      .sort((left, right) => right.walletRecord.latestActivityAt - left.walletRecord.latestActivityAt);
  }, [historyRecords, paymentRecords, resolutions, walletRecords]);

  const walletSummaryByAddress = useMemo(
    () =>
      walletSummaries.reduce<Record<string, WalletActivitySummary>>((summaries, summary) => {
        summaries[summary.address] = summary;
        return summaries;
      }, {}),
    [walletSummaries]
  );

  const uniquePredictionWallets = useMemo(
    () => Array.from(new Set(predictionParticipants.map((notification) => notification.userWallet))),
    [predictionParticipants]
  );

  const adminWalletSummary = useMemo<AdminWalletSummary | null>(() => {
    if (!walletAddress) {
      return null;
    }

    const receivedNotifications = paymentRecords.filter((notification) => notification.recipientWallet === walletAddress);
    const reviewedNotifications = paymentRecords.filter((notification) => notification.reviewedByWallet === walletAddress);
    const resolvedMarketsCount = Object.values(resolutions).filter(
      (resolution) => resolution.resolvedByWallet === walletAddress
    ).length;
    const lastActivityAt = [
      ...receivedNotifications.map((notification) => notification.updatedAt || notification.createdAt),
      ...reviewedNotifications.map((notification) => notification.reviewedAt ?? 0),
      ...Object.values(resolutions)
        .filter((resolution) => resolution.resolvedByWallet === walletAddress)
        .map((resolution) => resolution.resolvedAt),
    ].reduce((latest, value) => Math.max(latest, value), 0);

    return {
      address: walletAddress,
      connectedNow: true,
      lastActivityAt: lastActivityAt || null,
      receivedPaymentsCount: receivedNotifications.length,
      pendingReceivedCount: receivedNotifications.filter((notification) => notification.status === "pending").length,
      approvedReceivedCount: receivedNotifications.filter((notification) => notification.status === "approved").length,
      rejectedReceivedCount: receivedNotifications.filter((notification) => notification.status === "rejected").length,
      totalReceivedUsdc: receivedNotifications.reduce((total, notification) => total + notification.totalPaidUsdc, 0),
      totalApprovedUsdc: receivedNotifications
        .filter((notification) => notification.status === "approved")
        .reduce((total, notification) => total + notification.totalPaidUsdc, 0),
      totalPendingUsdc: receivedNotifications
        .filter((notification) => notification.status === "pending")
        .reduce((total, notification) => total + notification.totalPaidUsdc, 0),
      reviewedPaymentsCount: reviewedNotifications.length,
      resolvedMarketsCount,
    };
  }, [paymentRecords, resolutions, walletAddress]);

  const participantGroups = useMemo(() => {
    return predictionParticipants.reduce<Record<string, RegistryPaymentRecord[]>>((groups, participant) => {
      const key = participant.categoryLabel || "Prediction";
      groups[key] = [...(groups[key] ?? []), participant];
      return groups;
    }, {});
  }, [predictionParticipants]);

  useEffect(() => {
    setReviewActionByReference((currentValue) => {
      const activeReferences = new Set(pendingNotifications.map((notification) => notification.paymentReference));
      let hasChange = false;
      const nextValue = Object.fromEntries(
        Object.entries(currentValue).filter(([paymentReference]) => {
          const shouldKeep = activeReferences.has(paymentReference);
          if (!shouldKeep) {
            hasChange = true;
          }
          return shouldKeep;
        })
      ) as Record<string, "approved" | "rejected">;

      return hasChange ? nextValue : currentValue;
    });
  }, [pendingNotifications]);

  const aiListings = useMemo(() => readAIListings(), [aiListingRefreshIndex]);
  const pendingAIListings = useMemo(
    () => aiListings.filter((listing) => listing.status === "pending"),
    [aiListings]
  );

  const handleAdminListingFileUpload = useCallback(
    async (key: "iconSrc" | "guideFileUrl", nameKey: "iconName" | "guideFileName", fileList: FileList | null) => {
      const file = fileList?.[0];

      if (!file) {
        return;
      }

      try {
        const fileUrl = await readFileAsDataUrl(file);
        setAdminListingDraft((currentValue) => ({
          ...currentValue,
          [key]: fileUrl,
          [nameKey]: file.name,
        }));
      } catch {
        setAdminListingStatusMessage("The selected file could not be loaded. Please try another file.");
      }
    },
    []
  );

  const handleCreateAdminListing = useCallback(() => {
    if (!walletAddress) {
      setAdminListingStatusMessage("Connect the admin wallet first to publish a 0 fee AI listing.");
      return;
    }

    if (!adminListingDraft.displayName.trim() || !adminListingDraft.websiteUrl.trim() || !adminListingDraft.description.trim()) {
      setAdminListingStatusMessage("Name, website, and description are required before the admin can publish an AI listing.");
      return;
    }

    appendAIListingSubmission({
      id: `admin-ai-${Date.now()}`,
      walletAddress,
      displayName: adminListingDraft.displayName.trim(),
      twitterHandle: adminListingDraft.twitterHandle.trim(),
      iconSrc: adminListingDraft.iconSrc || "./placeholder.svg",
      iconName: adminListingDraft.iconName || "placeholder.svg",
      websiteUrl: adminListingDraft.websiteUrl.trim(),
      description: adminListingDraft.description.trim(),
      socialUrl: adminListingDraft.socialUrl.trim() || adminListingDraft.websiteUrl.trim(),
      guideFileName: adminListingDraft.guideFileName || "Admin guide",
      guideFileUrl: adminListingDraft.guideFileUrl || adminListingDraft.websiteUrl.trim(),
      planId: "free",
      billingLabel: "$0 / admin",
      amountUsd: 0,
      autoRenewEnabled: false,
      submittedAt: Date.now(),
      updatedAt: Date.now(),
      status: "approved",
      badge: "none",
      adminNotes: "Published by admin with 0 fee.",
      visibleInExplore: true,
      visitorCount: 0,
      uniqueVisitorKeys: [],
    });

    setAdminListingDraft({
      displayName: "",
      twitterHandle: "",
      websiteUrl: "",
      description: "",
      socialUrl: "",
      iconSrc: "",
      iconName: "",
      guideFileName: "",
      guideFileUrl: "",
    });
    setShowAdminListingForm(false);
    setAdminListingStatusMessage("The admin AI listing is now published on the platform with 0 fee.");
  }, [adminListingDraft, walletAddress]);

  const handleMarkAsPaid = useCallback(async (entryId: string) => {
    if (!walletAddress) return;
    try {
      setMarkingPaidId(entryId);
      const result = await markClaimAsPaid(entryId, walletAddress);
      if (result.success) {
        toast.success("Paiement confirmé", { description: "Le claim a été marqué comme payé." });
      } else {
        toast.error("Échec", { description: result.error ?? "Impossible de marquer ce claim comme payé." });
      }
      await loadClaims();
    } finally {
      setMarkingPaidId(null);
    }
  }, [loadClaims, walletAddress]);

  if (!isAdminWallet) {
    return null;
  }

  return (
    <section id="admin-center" className="pb-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Card className="border-orange-200 bg-white text-zinc-950 shadow-[0_20px_60px_rgba(249,115,22,0.12)] dark:border-white/10 dark:bg-white/5 dark:text-white">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                Admin control center
              </Badge>
              <Badge className="border border-orange-200 bg-white text-zinc-700 hover:bg-white dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-900">
                Central wallet activity feed
              </Badge>
            </div>
            <CardTitle className="text-3xl">Centralized wallet tracking, payment review, and player oversight</CardTitle>
            <CardDescription className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
              The admin wallet can now consult every tracked user wallet, payment flow, prediction history, and gains or losses from one shared Octopus Market registry.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {adminWalletSummary ? (
              <div className="rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-100 via-white to-orange-50 p-5 dark:border-white/10 dark:bg-gradient-to-br dark:from-orange-500/10 dark:via-zinc-950 dark:to-black">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-zinc-950 dark:text-white">Admin wallet activity</p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      The receiver wallet gets its own overview for incoming platform payments, validations, and market settlement actions.
                    </p>
                    <p className="mt-3 font-medium text-zinc-950 dark:text-white">{adminWalletSummary.address}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      {adminWalletSummary.connectedNow ? "Connected now" : "Not connected"}
                      {adminWalletSummary.lastActivityAt ? ` · Latest admin activity ${formatMoment(adminWalletSummary.lastActivityAt)}` : " · Waiting for first admin action"}
                    </p>
                  </div>
                  <div className="grid gap-2 text-right text-sm text-zinc-600 dark:text-zinc-300">
                    <span>
                      Total received <strong className="text-zinc-950 dark:text-white">{formatCurrency(adminWalletSummary.totalReceivedUsdc)}</strong>
                    </span>
                    <span>
                      Approved received <strong className="text-emerald-600 dark:text-emerald-300">{formatCurrency(adminWalletSummary.totalApprovedUsdc)}</strong>
                    </span>
                    <span>
                      Pending received <strong className="text-orange-600 dark:text-orange-300">{formatCurrency(adminWalletSummary.totalPendingUsdc)}</strong>
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
                  <div className="rounded-2xl border border-orange-100 bg-white px-3 py-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                    <p className="uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Incoming payments</p>
                    <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">{adminWalletSummary.receivedPaymentsCount}</p>
                  </div>
                  <div className="rounded-2xl border border-orange-100 bg-white px-3 py-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                    <p className="uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Pending</p>
                    <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">{adminWalletSummary.pendingReceivedCount}</p>
                  </div>
                  <div className="rounded-2xl border border-orange-100 bg-white px-3 py-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                    <p className="uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Approved</p>
                    <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">{adminWalletSummary.approvedReceivedCount}</p>
                  </div>
                  <div className="rounded-2xl border border-orange-100 bg-white px-3 py-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                    <p className="uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Rejected</p>
                    <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">{adminWalletSummary.rejectedReceivedCount}</p>
                  </div>
                  <div className="rounded-2xl border border-orange-100 bg-white px-3 py-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                    <p className="uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Reviewed</p>
                    <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">{adminWalletSummary.reviewedPaymentsCount}</p>
                  </div>
                  <div className="rounded-2xl border border-orange-100 bg-white px-3 py-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                    <p className="uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Markets settled</p>
                    <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">{adminWalletSummary.resolvedMarketsCount}</p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-5">
              <button
                type="button"
                onClick={() => setSelectedPanel("wallets")}
                className={`rounded-2xl border px-4 py-4 text-left transition ${selectedPanel === "wallets" ? "border-orange-300 bg-orange-100/90" : "border-orange-100 bg-orange-50 hover:border-orange-300 dark:border-white/10 dark:bg-black/20 dark:hover:border-white/20"}`}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  <Users className="size-4 text-orange-500 dark:text-orange-300" />
                  Connected wallets
                </div>
                <p className="mt-3 text-3xl font-semibold text-zinc-950 dark:text-white">{walletSummaries.length}</p>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Every tracked non-admin wallet appears here with activity, payments, history, wins, and losses.</p>
              </button>
              <button
                type="button"
                onClick={() => setSelectedPanel("pending")}
                className={`rounded-2xl border px-4 py-4 text-left transition ${selectedPanel === "pending" ? "border-orange-300 bg-orange-100/90" : "border-orange-100 bg-orange-50 hover:border-orange-300 dark:border-white/10 dark:bg-black/20 dark:hover:border-white/20"}`}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  <Bell className="size-4 text-orange-500 dark:text-orange-300" />
                  Pending approvals
                </div>
                <p className="mt-3 text-3xl font-semibold text-zinc-950 dark:text-white">{pendingNotifications.length}</p>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Review waiting payments with the full user snapshot behind each one.</p>
              </button>
              <button
                type="button"
                onClick={() => setSelectedPanel("approved")}
                className={`rounded-2xl border px-4 py-4 text-left transition ${selectedPanel === "approved" ? "border-emerald-300 bg-emerald-50/90" : "border-orange-100 bg-orange-50 hover:border-emerald-300 dark:border-white/10 dark:bg-black/20 dark:hover:border-emerald-500/30"}`}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  <CheckCircle2 className="size-4 text-emerald-500 dark:text-emerald-300" />
                  Approved payments
                </div>
                <p className="mt-3 text-3xl font-semibold text-zinc-950 dark:text-white">{approvedNotifications.length}</p>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Review approved receipts with user totals, history, and validation timeline.</p>
              </button>
              <button
                type="button"
                onClick={() => setSelectedPanel("participants")}
                className={`rounded-2xl border px-4 py-4 text-left transition ${selectedPanel === "participants" ? "border-orange-300 bg-orange-100/90" : "border-orange-100 bg-orange-50 hover:border-orange-300 dark:border-white/10 dark:bg-black/20 dark:hover:border-white/20"}`}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  <ShieldCheck className="size-4 text-orange-500 dark:text-orange-300" />
                  Prediction participants
                </div>
                <p className="mt-3 text-3xl font-semibold text-zinc-950 dark:text-white">{uniquePredictionWallets.length}</p>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Open to inspect players by section with wallet-level totals and dates.</p>
              </button>
              <button
                type="button"
                onClick={() => setSelectedPanel("claims")}
                className={`rounded-2xl border px-4 py-4 text-left transition ${selectedPanel === "claims" ? "border-emerald-300 bg-emerald-50/90" : "border-orange-100 bg-orange-50 hover:border-emerald-300 dark:border-white/10 dark:bg-black/20 dark:hover:border-emerald-500/30"}`}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  <Coins className="size-4 text-emerald-500 dark:text-emerald-300" />
                  Claims
                </div>
                <p className="mt-3 text-3xl font-semibold text-zinc-950 dark:text-white">{claimsHistory.length}</p>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Rewards claimed by users. Mark as paid once the USDC transfer is sent.</p>
              </button>
            </div>

            {selectedPanel === "wallets" ? (
              <div className="rounded-3xl border border-orange-200 bg-orange-50/70 p-5 dark:border-white/10 dark:bg-black/20">
                <p className="text-lg font-semibold text-zinc-950 dark:text-white">Connected wallets details</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Every non-admin wallet connected to Octopus Market appears here with first connection, latest activity, payment counts, history, wins, and losses.
                </p>
                <div className="mt-5 space-y-3">
                  {walletSummaries.length > 0 ? (
                    walletSummaries.map((wallet) => (
                      <div key={wallet.address} className="rounded-2xl border border-orange-100 bg-white px-4 py-4 dark:border-white/10 dark:bg-zinc-950/80">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-zinc-950 dark:text-white">
                              {wallet.walletRecord.displayName || wallet.walletRecord.username ? `${wallet.walletRecord.displayName || wallet.walletRecord.username} · ` : ""}
                              {wallet.address}
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                              First seen {formatMoment(wallet.walletRecord.firstConnectedAt)} · Last seen {formatMoment(wallet.walletRecord.lastConnectedAt)} · Latest activity {formatMoment(wallet.walletRecord.latestActivityAt)}
                            </p>
                            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{wallet.walletRecord.latestActivityLabel}</p>
                            {wallet.walletRecord.twitterHandle ? (
                              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{wallet.walletRecord.twitterHandle}</p>
                            ) : null}
                          </div>
                          <div className="grid gap-2 text-right text-sm text-zinc-600 dark:text-zinc-300">
                            <span>Stake: <strong className="text-zinc-950 dark:text-white">{formatCurrency(wallet.totalStaked)}</strong></span>
                            <span>Won: <strong className="text-emerald-600 dark:text-emerald-300">{formatCurrency(wallet.totalWon)}</strong></span>
                            <span>Lost: <strong className="text-red-600 dark:text-red-300">{formatCurrency(wallet.totalLost)}</strong></span>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-5">
                          <div className="rounded-2xl border border-orange-100 bg-orange-50 px-3 py-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                            <p className="uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Connections</p>
                            <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">{wallet.walletRecord.connectionCount}</p>
                          </div>
                          <div className="rounded-2xl border border-orange-100 bg-orange-50 px-3 py-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                            <p className="uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Prediction entries</p>
                            <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">{wallet.predictionCount}</p>
                          </div>
                          <div className="rounded-2xl border border-orange-100 bg-orange-50 px-3 py-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                            <p className="uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Pending</p>
                            <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">{wallet.pendingCount}</p>
                          </div>
                          <div className="rounded-2xl border border-orange-100 bg-orange-50 px-3 py-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                            <p className="uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Approved</p>
                            <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">{wallet.approvedCount}</p>
                          </div>
                          <div className="rounded-2xl border border-orange-100 bg-orange-50 px-3 py-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                            <p className="uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Rejected</p>
                            <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">{wallet.rejectedCount}</p>
                          </div>
                        </div>
                        <Separator className="my-3 bg-orange-100 dark:bg-white/10" />
                        <div className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                          {wallet.entries.length > 0 ? (
                            wallet.entries.map((entry) => {
                              const payment = wallet.payments.find((item) => item.paymentReference === entry.paymentReference);
                              const resolution = resolutions[entry.marketId];
                              const resultLabel = payment?.status === "rejected"
                                ? "Rejected"
                                : resolution
                                  ? resolution.outcomeId === entry.selectionId
                                    ? "Win"
                                    : "Lose"
                                  : "Pending";

                              return (
                                <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-orange-50 px-3 py-3 dark:border-white/10 dark:bg-black/20">
                                  <div>
                                    <p className="font-medium text-zinc-950 dark:text-white">{entry.marketTitle}</p>
                                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                      {entry.selectionLabel} · {formatMoment(entry.createdAt)} · Ref {entry.paymentReference}
                                    </p>
                                  </div>
                                  <div className="grid gap-1 text-right text-xs text-zinc-600 dark:text-zinc-300">
                                    <span>{formatCurrency(entry.amount)}</span>
                                    <span>{resultLabel}</span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="rounded-2xl border border-dashed border-orange-200 bg-white px-4 py-4 text-sm text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-400">
                              No prediction history for this wallet yet.
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-orange-200 bg-white px-4 py-5 text-sm text-zinc-600 dark:border-white/10 dark:bg-zinc-950/80 dark:text-zinc-400">
                      No connected wallets have been tracked yet.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {selectedPanel === "pending" ? (
              <div className="rounded-3xl border border-orange-200 bg-orange-50/70 p-5 dark:border-white/10 dark:bg-black/20">
                <p className="text-lg font-semibold text-zinc-950 dark:text-white">Pending approvals</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Review every payment waiting for admin validation, then approve or reject it with the user activity snapshot visible below.
                </p>
                <div className="mt-5 space-y-3">
                  {pendingNotifications.length > 0 ? (
                    pendingNotifications.map((notification) => (
                      <div key={notification.id} className="rounded-2xl border border-orange-100 bg-white px-4 py-4 dark:border-white/10 dark:bg-zinc-950/80">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-zinc-950 dark:text-white">{notification.title}</p>
                            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{notification.subtitle || notification.categoryLabel || "Waiting for admin review"}</p>
                          </div>
                          <p className="text-sm font-semibold text-zinc-950 dark:text-white">{formatCurrency(notification.totalPaidUsdc)} USDC</p>
                        </div>
                        <Separator className="my-3 bg-orange-100 dark:bg-white/10" />
                        <div className="grid gap-3 text-sm text-zinc-700 xl:grid-cols-[minmax(0,2.2fr)_minmax(120px,0.9fr)_minmax(120px,0.9fr)_minmax(140px,0.8fr)] dark:text-zinc-300">
                          <div className="min-w-0">
                            <span className="text-xs uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Wallet</span>
                            <p className="mt-1 truncate font-medium text-zinc-950 dark:text-white">
                              {formatNotificationWalletLabel(notification, walletSummaryByAddress)}
                            </p>
                            <p className="mt-1 break-all font-mono text-xs text-zinc-500 dark:text-zinc-400">{notification.userWallet}</p>
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Section</span>
                            <p className="mt-1 break-words font-medium text-zinc-950 dark:text-white">{notification.categoryLabel || "Platform flow"}</p>
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Choice</span>
                            <p className="mt-1 break-words font-medium text-zinc-950 dark:text-white">{notification.selectionLabel || "Payment only"}</p>
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Received at</span>
                            <p className="mt-1 font-medium text-zinc-950 dark:text-white">{formatMoment(notification.createdAt)}</p>
                          </div>
                        </div>
                        <div className="mt-3 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                          <p className="font-medium text-zinc-950 dark:text-white">User activity snapshot</p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                            <span>Total stake {formatCurrency(walletSummaryByAddress[notification.userWallet]?.totalStaked ?? 0)}</span>
                            <span>Pending {walletSummaryByAddress[notification.userWallet]?.pendingCount ?? 0}</span>
                            <span>Approved {walletSummaryByAddress[notification.userWallet]?.approvedCount ?? 0}</span>
                            <span>Won {formatCurrency(walletSummaryByAddress[notification.userWallet]?.totalWon ?? 0)}</span>
                            <span>Lost {formatCurrency(walletSummaryByAddress[notification.userWallet]?.totalLost ?? 0)}</span>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          {(() => {
                            const reviewAction = reviewActionByReference[notification.paymentReference];
                            const approveIsActive = reviewAction === "approved";
                            const rejectIsActive = reviewAction === "rejected";

                            return (
                              <>
                          <Button
                            type="button"
                            className={`rounded-2xl text-white transition-colors ${approveIsActive ? "bg-emerald-700 ring-2 ring-emerald-200 hover:bg-emerald-700 dark:ring-emerald-500/30" : "bg-emerald-600 hover:bg-emerald-500"}`}
                            onClick={() => {
                              setReviewActionByReference((currentValue) => ({
                                ...currentValue,
                                [notification.paymentReference]: "approved",
                              }));
                              updateAdminPaymentNotificationStatus(notification.paymentReference, "approved", walletAddress ?? predictionMarketTreasuryAddress);
                              toast.success("Paiement approuvé", { description: `Référence ${notification.paymentReference.slice(0, 8)}… validée.` });
                            }}
                          >
                            <CheckCircle2 className="size-4" />
                            {approveIsActive ? "Approved" : "Approve"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={`rounded-2xl transition-colors ${rejectIsActive ? "border-red-300 bg-red-100 text-red-700 hover:bg-red-100 dark:border-red-500/40 dark:bg-red-500/20 dark:text-red-200 dark:hover:bg-red-500/20" : "border-red-200 bg-white text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:bg-zinc-950 dark:text-red-300 dark:hover:bg-red-500/10"}`}
                            onClick={() => {
                              setReviewActionByReference((currentValue) => ({
                                ...currentValue,
                                [notification.paymentReference]: "rejected",
                              }));
                              updateAdminPaymentNotificationStatus(notification.paymentReference, "rejected", walletAddress ?? predictionMarketTreasuryAddress);
                              toast.error("Paiement rejeté", { description: `Référence ${notification.paymentReference.slice(0, 8)}… rejetée.` });
                            }}
                          >
                            <XCircle className="size-4" />
                            {rejectIsActive ? "Rejected" : "Reject"}
                          </Button>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-orange-200 bg-white px-4 py-5 text-sm text-zinc-600 dark:border-white/10 dark:bg-zinc-950/80 dark:text-zinc-400">
                      No pending approvals right now.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {selectedPanel === "approved" ? (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <p className="text-lg font-semibold text-zinc-950 dark:text-white">Approved payments history</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Review every payment already confirmed as received by the admin wallet, together with the related user wallet metrics and history.
                </p>
                <div className="mt-5 space-y-3">
                  {approvedNotifications.length > 0 ? (
                    approvedNotifications.map((notification) => (
                      <div key={notification.id} className="rounded-2xl border border-emerald-200 bg-white px-4 py-4 dark:border-emerald-500/20 dark:bg-zinc-950/80">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-zinc-950 dark:text-white">{notification.title}</p>
                            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{notification.subtitle || "Approved by admin"}</p>
                          </div>
                          <p className="text-sm font-semibold text-zinc-950 dark:text-white">{formatCurrency(notification.totalPaidUsdc)} USDC</p>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500 dark:text-zinc-400">
                          <span>
                            User {walletSummaryByAddress[notification.userWallet]?.walletRecord.displayName || walletSummaryByAddress[notification.userWallet]?.walletRecord.username || notification.username
                              ? `${walletSummaryByAddress[notification.userWallet]?.walletRecord.displayName || walletSummaryByAddress[notification.userWallet]?.walletRecord.username || notification.username} · ${formatWalletAddress(notification.userWallet)}`
                              : formatWalletAddress(notification.userWallet)}
                          </span>
                          <span>Approved {notification.reviewedAt ? formatMoment(notification.reviewedAt) : formatMoment(notification.createdAt)}</span>
                          <span>Total stake {formatCurrency(walletSummaryByAddress[notification.userWallet]?.totalStaked ?? 0)}</span>
                          <span>Wins {formatCurrency(walletSummaryByAddress[notification.userWallet]?.totalWon ?? 0)}</span>
                          <span>Losses {formatCurrency(walletSummaryByAddress[notification.userWallet]?.totalLost ?? 0)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-emerald-200 bg-white px-4 py-5 text-sm text-zinc-600 dark:border-emerald-500/20 dark:bg-zinc-950/80 dark:text-zinc-400">
                      No approved payment history yet.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {selectedPanel === "participants" ? (
              <div className="rounded-3xl border border-orange-200 bg-orange-50/70 p-5 dark:border-white/10 dark:bg-black/20">
                <p className="text-lg font-semibold text-zinc-950 dark:text-white">Prediction participants by section</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Follow the total number of participants and inspect which user wallet joined each section with their payment and activity details.
                </p>
                <div className="mt-5 space-y-4">
                  {Object.entries(participantGroups).length > 0 ? (
                    Object.entries(participantGroups).map(([categoryLabel, participants]) => (
                      <div key={categoryLabel} className="rounded-2xl border border-orange-100 bg-white px-4 py-4 dark:border-white/10 dark:bg-zinc-950/80">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="font-semibold text-zinc-950 dark:text-white">{categoryLabel}</p>
                          <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                            {participants.length} participant{participants.length > 1 ? "s" : ""}
                          </Badge>
                        </div>
                        <div className="mt-4 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                          {participants.map((participant) => (
                            <div key={participant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-orange-50 px-3 py-3 dark:border-white/10 dark:bg-black/20">
                              <div>
                                <p className="font-medium text-zinc-950 dark:text-white">
                                  {walletSummaryByAddress[participant.userWallet]?.walletRecord.displayName || walletSummaryByAddress[participant.userWallet]?.walletRecord.username || participant.username
                                    ? `${walletSummaryByAddress[participant.userWallet]?.walletRecord.displayName || walletSummaryByAddress[participant.userWallet]?.walletRecord.username || participant.username} · ${participant.userWallet}`
                                    : participant.userWallet}
                                </p>
                                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{participant.selectionLabel || "Pending choice"}</p>
                              </div>
                              <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                                <p>{formatCurrency(participant.totalPaidUsdc)}</p>
                                <p>{formatMoment(participant.createdAt)}</p>
                              </div>
                              <div className="w-full text-xs text-zinc-500 dark:text-zinc-400">
                                Wallet totals · stake {formatCurrency(walletSummaryByAddress[participant.userWallet]?.totalStaked ?? 0)} · approved {walletSummaryByAddress[participant.userWallet]?.approvedCount ?? 0} · pending {walletSummaryByAddress[participant.userWallet]?.pendingCount ?? 0}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-orange-200 bg-white px-4 py-5 text-sm text-zinc-600 dark:border-white/10 dark:bg-zinc-950/80 dark:text-zinc-400">
                      No prediction participants yet.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {selectedPanel === "claims" ? (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-500/20 dark:bg-black/20">
                <p className="text-lg font-semibold text-zinc-950 dark:text-white">Claims — rewards to pay out</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Users who won a bet and clicked Claim appear here. Mark each one as Paid once you have sent the USDC to their wallet.
                </p>
                <div className="mt-5 space-y-3">
                  {claimsHistory.length > 0 ? (
                    claimsHistory.map((entry) => {
                      const isPaid = entry.payoutStatus === "paid";
                      const isMarkingThis = markingPaidId === entry.id;
                      return (
                        <div
                          key={entry.id}
                          className={`rounded-2xl border px-4 py-4 ${isPaid ? "border-emerald-200 bg-white dark:border-emerald-500/20 dark:bg-zinc-950/80" : "border-orange-100 bg-white dark:border-white/10 dark:bg-zinc-950/80"}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1 text-sm">
                              <p className="font-semibold text-zinc-950 dark:text-white">{entry.marketTitle}</p>
                              <p className="text-zinc-500 dark:text-zinc-400">{formatWalletAddress(entry.walletAddress)}</p>
                              <p className="text-zinc-500 dark:text-zinc-400">
                                Selection: <span className="font-medium text-zinc-700 dark:text-zinc-300">{entry.selectionLabel}</span>
                              </p>
                              <p className="text-zinc-500 dark:text-zinc-400">
                                Net reward: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(entry.netReward)}</span>
                              </p>
                              {entry.claimedAt ? (
                                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                                  Claimed: {formatMoment(entry.claimedAt)}
                                </p>
                              ) : null}
                              {isPaid && entry.paidAt ? (
                                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                  Paid: {formatMoment(entry.paidAt)}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              {isPaid ? (
                                <Badge className="border border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-300">
                                  Paid
                                </Badge>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={isMarkingThis}
                                  className="rounded-xl bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-60"
                                  onClick={() => void handleMarkAsPaid(entry.id)}
                                >
                                  {isMarkingThis ? "Saving…" : "Mark as paid"}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed border-emerald-200 bg-white px-4 py-5 text-sm text-zinc-600 dark:border-emerald-500/20 dark:bg-zinc-950/80 dark:text-zinc-400">
                      No claims yet. When a user wins a bet and clicks Claim, it appears here.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {rejectedNotifications.length > 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Rejected payments stay visible so both the admin and the player see the final decision clearly.
              </p>
            ) : null}

            <AdminPaymentsManualConfirm walletAddress={walletAddress} initialPending={pendingNotifications} />

            <div className="rounded-3xl border border-orange-200 bg-orange-50/70 p-5 dark:border-white/10 dark:bg-black/20">
              <p className="text-lg font-semibold text-zinc-950 dark:text-white">AI listing moderation</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Review every submitted AI listing, validate the product, approve or reject the listing, and control the blue badge directly from the admin side.
              </p>
              <div className="mt-4 rounded-3xl border border-orange-100 bg-white p-4 dark:border-white/10 dark:bg-zinc-950/80">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-zinc-950 dark:text-white">Admin free AI listing</p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      Publish an AI directly from the admin panel with 0 fee. The listing becomes visible immediately on the platform.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl border-orange-200 bg-white text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
                    onClick={() => setShowAdminListingForm((currentValue) => !currentValue)}
                  >
                    {showAdminListingForm ? "Close" : "Add free AI"}
                  </Button>
                </div>
                <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{adminListingStatusMessage}</p>
                {showAdminListingForm ? (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <Input
                        value={adminListingDraft.displayName}
                        onChange={(event) =>
                          setAdminListingDraft((currentValue) => ({ ...currentValue, displayName: event.target.value }))
                        }
                        placeholder="AI name"
                        className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                      />
                      <Input
                        value={adminListingDraft.twitterHandle}
                        onChange={(event) =>
                          setAdminListingDraft((currentValue) => ({ ...currentValue, twitterHandle: event.target.value }))
                        }
                        placeholder="X / Twitter handle"
                        className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                      />
                      <Input
                        value={adminListingDraft.websiteUrl}
                        onChange={(event) =>
                          setAdminListingDraft((currentValue) => ({ ...currentValue, websiteUrl: event.target.value }))
                        }
                        placeholder="Website URL"
                        className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                      />
                      <Input
                        value={adminListingDraft.socialUrl}
                        onChange={(event) =>
                          setAdminListingDraft((currentValue) => ({ ...currentValue, socialUrl: event.target.value }))
                        }
                        placeholder="Social URL"
                        className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                      />
                    </div>
                    <div className="space-y-3">
                      <Textarea
                        value={adminListingDraft.description}
                        onChange={(event) =>
                          setAdminListingDraft((currentValue) => ({ ...currentValue, description: event.target.value }))
                        }
                        placeholder="AI description"
                        className="min-h-28 border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                      />
                      <label className="block rounded-2xl border border-dashed border-orange-200 bg-orange-50/70 px-4 py-3 text-sm text-zinc-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                        <span className="font-medium">AI icon</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="mt-2 block w-full text-xs"
                          onChange={(event) => {
                            void handleAdminListingFileUpload("iconSrc", "iconName", event.target.files);
                          }}
                        />
                        <span className="mt-2 block text-xs text-zinc-500 dark:text-zinc-400">{adminListingDraft.iconName || "Optional image upload"}</span>
                      </label>
                      <label className="block rounded-2xl border border-dashed border-orange-200 bg-orange-50/70 px-4 py-3 text-sm text-zinc-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                        <span className="font-medium">Guide PDF</span>
                        <input
                          type="file"
                          accept="application/pdf"
                          className="mt-2 block w-full text-xs"
                          onChange={(event) => {
                            void handleAdminListingFileUpload("guideFileUrl", "guideFileName", event.target.files);
                          }}
                        />
                        <span className="mt-2 block text-xs text-zinc-500 dark:text-zinc-400">{adminListingDraft.guideFileName || "Optional PDF upload"}</span>
                      </label>
                    </div>
                    <div className="lg:col-span-2 flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        className="rounded-2xl bg-emerald-600 text-white hover:bg-emerald-500"
                        onClick={handleCreateAdminListing}
                      >
                        Publish free AI
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl border-orange-200 bg-white text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
                        onClick={() => {
                          setShowAdminListingForm(false);
                          setAdminListingStatusMessage("Admin can publish an AI listing with 0 fee and make it visible immediately on the platform.");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="mt-5 space-y-3">
                {pendingAIListings.length > 0 ? (
                  pendingAIListings.map((listing) => (
                    <div
                      key={listing.id}
                      className="rounded-2xl border border-orange-100 bg-white px-4 py-4 dark:border-white/10 dark:bg-zinc-950/80"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <img src={listing.iconSrc} alt={listing.displayName} className="size-12 rounded-2xl object-cover" />
                          <div>
                            <p className="font-semibold text-zinc-950 dark:text-white">{listing.displayName}</p>
                            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{listing.twitterHandle} · {listing.websiteUrl}</p>
                          </div>
                        </div>
                        <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                          {listing.planId === "starter" ? "Starter" : "Builder"}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-zinc-700 dark:text-zinc-300">{listing.description}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                        <span>Submitted {formatMoment(listing.submittedAt)}</span>
                        <span>Wallet {formatWalletAddress(listing.walletAddress)}</span>
                        <span>Auto renew {listing.autoRenewEnabled ? "enabled" : "disabled"}</span>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Button
                          type="button"
                          className="rounded-2xl bg-emerald-600 text-white hover:bg-emerald-500"
                          onClick={() =>
                            updateAIListingSubmission(listing.id, (currentListing) => ({
                              ...currentListing,
                              status: "approved",
                              badge: currentListing.badge,
                              updatedAt: Date.now(),
                            }))
                          }
                        >
                          Approve listing
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-2xl border-red-200 bg-white text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:bg-zinc-950 dark:text-red-300 dark:hover:bg-red-500/10"
                          onClick={() =>
                            updateAIListingSubmission(listing.id, (currentListing) => ({
                              ...currentListing,
                              status: "rejected",
                              updatedAt: Date.now(),
                            }))
                          }
                        >
                          Reject listing
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-2xl border-orange-200 bg-white text-zinc-900 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"
                          onClick={() =>
                            updateAIListingSubmission(listing.id, (currentListing) => ({
                              ...currentListing,
                              badge: currentListing.badge === "blue" ? "none" : "blue",
                              updatedAt: Date.now(),
                            }))
                          }
                        >
                          Toggle blue badge
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-orange-200 bg-white px-4 py-5 text-sm text-zinc-600 dark:border-white/10 dark:bg-zinc-950/80 dark:text-zinc-400">
                    No AI listing is waiting for admin review.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

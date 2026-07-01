import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Signature,
  Trash2,
  Wallet,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  notifyAdminForValidatedPayment,
  persistAdminNotificationsStateToServer,
  readAdminPaymentNotifications,
  subscribeToAdminStorage,
  type AdminPaymentNotification,
} from "@/components/octopus-market/octopus-admin";
import {
  appendCentralAdminLog,
  readCachedCentralWalletRecord,
  syncPredictionHistoryToCentralRegistry,
} from "@/components/octopus-market/octopus-central-registry";
import {
  appendPredictionHistoryEntry,
  commitPredictionMarketStateToServer,
  createPredictionMarketOnServer,
  deletePredictionMarketOnServer,
  readAdminCreatedPredictionMarkets,
  readPredictionHistory,
  readPredictionResolutions,
  resolvePredictionMarketOnServer,
  syncPredictionEntriesForResolvedMarket,
  subscribeToPredictionMarketStorage,
  updatePredictionHistoryEntry,
  isStoreHydrated,
  type AdminCreatedPredictionMarket,
  type PredictionHistoryEntry,
  type PredictionResolutionRecord,
} from "@/components/octopus-market/prediction-market-store";
import {
  paymentTokenSymbol,
  predictionMarketCategories,
  predictionMarketFeeRate,
  predictionMarketMaxStakeUsd,
  predictionMarketMinStakeClt,
  predictionMarketMinStakeUsd,
  predictionMarketQuestions,
  predictionMarketReserveFeeRate,
  predictionMarketTreasuryAddress,
  solanaUsdcMintAddress,
  type PredictionMarketOption,
  type PredictionMarketQuestion,
} from "@/components/octopus-market/octopus-market-data";
import {
  calculatePercentageAmount,
  formatWalletAddress,
  getSolanaProvider,
  SOLANA_CLAWDTRUST_MINT,
  readCachedWalletSnapshot,
} from "@/components/octopus-market/solana-wallet";
import type { PaymentRequest } from "@/components/octopus-market/solana-pay";
import { getAllMarketsAdmin, getAllPredictionHistoryAdmin } from "@/services/supabase/prediction-service";
import { creditBetOcto, creditReferralCommission, getAllCommissionClaims, markCommissionClaimPaid } from "@/services/supabase/octo-service";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BetToken, PredictionMarketRow, ReferralCommissionClaimRow } from "@/lib/supabase-types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// ─── Event status helpers ─────────────────────────────────────────────────────


function getEventLiveStatus(eventStartAt: string | null | undefined): "live" | "upcoming" | "none" {
  if (!eventStartAt) return "none";
  return Date.now() >= new Date(eventStartAt).getTime() ? "live" : "upcoming";
}

function formatCountdown(eventStartAt: string): string {
  const diff = new Date(eventStartAt).getTime() - Date.now();
  if (diff <= 0) return "LIVE";
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function MarketCountdownText({ eventStartAt }: { eventStartAt: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  void tick;
  const remaining = formatCountdown(eventStartAt);
  if (remaining === "LIVE") return null;
  return <>{remaining}</>;
}

function MarketEventCountdown({ eventStartAt }: { eventStartAt: string | null | undefined }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!eventStartAt) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [eventStartAt]);

  if (!eventStartAt) return null;

  const status = getEventLiveStatus(eventStartAt);

  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400">
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        LIVE
      </span>
    );
  }

  // upcoming — force re-render chaque seconde grâce à `tick`
  void tick;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600 dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-orange-300">
      ⏳ Starts in {formatCountdown(eventStartAt)}
    </span>
  );
}

type BinaryPredictionStudioProps = {
  isWalletConnected: boolean;
  walletAddress: string | null;
  walletUsername?: string | null;
  onConnectWallet: () => Promise<string | null>;
  selectedCategoryId?: string;
  selectedMarketId?: string | null;
};

type MarketOptionSummary = PredictionMarketOption & {
  liveVolumeUsd: number;
  grossReturnUsd: number;
  netReturnUsd: number;
};

let paymentModulePromise: Promise<typeof import("@/components/octopus-market/solana-pay")> | null = null;

function loadPaymentModule() {
  if (!paymentModulePromise) {
    paymentModulePromise = import("@/components/octopus-market/solana-pay").catch((err) => {
      // Réinitialiser pour permettre une nouvelle tentative au prochain appel
      paymentModulePromise = null;
      throw err;
    });
  }

  return paymentModulePromise;
}


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

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildClaimReference() {
  return `CLAIM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function getDemandSplit(index: number) {
  const yesShare = 52 + ((index * 7) % 21);
  return {
    yesShare,
    noShare: 100 - yesShare,
    volume: 240 + index * 42,
  };
}

function getDefaultMarketOptions(index: number): PredictionMarketOption[] {
  const demand = getDemandSplit(index);
  const yesOdds = Number(clampValue(0.96 / (demand.yesShare / 100), 1.18, 3.2).toFixed(2));
  const noOdds = Number(clampValue(0.96 / (demand.noShare / 100), 1.18, 3.4).toFixed(2));

  return [
    {
      id: "yes",
      label: "Yes",
      oddsMultiplier: yesOdds,
      description: "Choose the yes side.",
      initialVolumeUsd: Number((demand.volume * (demand.yesShare / 100)).toFixed(2)),
    },
    {
      id: "no",
      label: "No",
      oddsMultiplier: noOdds,
      description: "Choose the no side.",
      initialVolumeUsd: Number((demand.volume * (demand.noShare / 100)).toFixed(2)),
    },
  ];
}

function getMarketOptions(question: PredictionMarketQuestion, index: number) {
  return question.options?.length ? question.options : getDefaultMarketOptions(index);
}

function buildOptionSummaries(
  question: PredictionMarketQuestion,
  marketOptions: PredictionMarketOption[],
  allHistoryEntries: PredictionHistoryEntry[],
  paymentNotifications: AdminPaymentNotification[],
  amount: number,
  token: BetToken = "usdc"
): MarketOptionSummary[] {
  return marketOptions.map((option) => {
    const relevantEntries = allHistoryEntries.filter((entry) => {
      if (entry.marketId !== question.id || entry.selectionId !== option.id) {
        return false;
      }

      if (entry.token !== token) {
        return false;
      }

      const paymentNotification = paymentNotifications.find(
        (notification) => notification.paymentReference === entry.paymentReference
      );

      return paymentNotification?.status !== "rejected";
    });

    const initialVolume = token === "clawdtrust" ? 0 : (option.initialVolumeUsd ?? 0);
    const liveVolumeUsd = Number(
      (initialVolume + relevantEntries.reduce((total, entry) => total + entry.amount, 0)).toFixed(2)
    );
    const grossReturnUsd = Number((amount * option.oddsMultiplier).toFixed(2));
    const netReturnUsd = Number((grossReturnUsd * (1 - predictionMarketFeeRate / 100)).toFixed(2));

    return {
      ...option,
      liveVolumeUsd,
      grossReturnUsd,
      netReturnUsd,
    };
  });
}

function getSelectionTone(optionId: string) {
  if (optionId === "x-draw") {
    return "amber";
  }

  if (optionId === "b-win" || optionId === "no") {
    return "red";
  }

  return "green";
}

function getSelectionClasses(optionId: string, isActive: boolean) {
  const tone = getSelectionTone(optionId);

  if (isActive) {
    if (tone === "red") {
      return "border-red-300 bg-red-600 text-white hover:bg-red-500";
    }

    if (tone === "amber") {
      return "border-amber-300 bg-amber-500 text-white hover:bg-amber-400";
    }

    return "border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-500";
  }

  return "border-orange-200 bg-white text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900";
}

function getEntryStatusLabel(params: {
  adminStatus: string;
  isWinner: boolean;
  isLoser: boolean;
  claimedAt?: number;
}) {
  if (params.claimedAt) {
    return "Claimed";
  }

  if (params.adminStatus === "rejected") {
    return "Rejected";
  }

  if (params.isWinner) {
    return "Win";
  }

  if (params.isLoser) {
    return "Lose";
  }

  if (params.adminStatus === "approved") {
    return "Approved";
  }

  return "Pending";
}

function readStringMetadataValue(value: string | number | boolean | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readNumberMetadataValue(value: string | number | boolean | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function redirectToPredictionHistory() {
  if (typeof window === "undefined") {
    return;
  }

  window.history.replaceState(null, "", "#prediction-player-history");
  window.setTimeout(() => {
    window.document.getElementById("prediction-player-history")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, 120);
}

function buildPredictionHistoryEntryFromPaymentRequest(paymentRequest: PaymentRequest) {
  const metadata = paymentRequest.metadata ?? {};
  const paymentReference = paymentRequest.reference;

  return {
    id: `${readStringMetadataValue(metadata.marketId, paymentRequest.id)}-${paymentReference}`,
    marketId: readStringMetadataValue(metadata.marketId, paymentRequest.id),
    marketTitle: readStringMetadataValue(metadata.marketTitle, paymentRequest.message || "Prediction market"),
    categoryLabel: readStringMetadataValue(metadata.categoryLabel, "Prediction market"),
    selectionId: readStringMetadataValue(metadata.selectionId),
    selectionLabel: readStringMetadataValue(metadata.selectionLabel, paymentRequest.memo || "Market side"),
    amount: readNumberMetadataValue(metadata.stake, paymentRequest.amount),
    reserveFee: readNumberMetadataValue(metadata.reserveFee),
    totalCharged: readNumberMetadataValue(
      metadata.token === "clawdtrust" ? metadata.totalChargeClt : metadata.totalChargeUsdc,
      paymentRequest.amount
    ),
    claimFeeRate: readNumberMetadataValue(metadata.claimFeeRate, predictionMarketFeeRate),
    payoutMultiple: readNumberMetadataValue(metadata.payoutMultiple, 1),
    grossReward: readNumberMetadataValue(metadata.grossReward),
    netReward: readNumberMetadataValue(metadata.netReward),
    walletAddress: paymentRequest.walletAddress,
    paymentReference,
    paymentRequestId: paymentRequest.id,
    createdAt: paymentRequest.validatedAt ?? paymentRequest.createdAt,
    reportedAt: Date.now(),
    adminDecisionStatus: "pending",
    resultStatus: "pending_review",
    token: ((typeof metadata.token === "string" ? metadata.token : undefined) ?? "usdc") as BetToken,
  } satisfies PredictionHistoryEntry;
}

type AdminMarketCreationMode = "vs" | "simple";

type AdminMarketDraft = {
  categoryId: string;
  title: string;
  resolutionLabel: string;
  /** ISO datetime-local string — ex: "2026-07-10T20:00" */
  eventStartAt: string;
  mode: AdminMarketCreationMode;
  enableThirdOption: boolean;
  leftCompetitorName: string;
  leftCompetitorImageSrc: string;
  rightCompetitorName: string;
  rightCompetitorImageSrc: string;
  singleName: string;
  singleImageSrc: string;
  firstOdds: string;
  secondOdds: string;
  thirdOptionLabel: string;
  thirdOptionOdds: string;
  thirdOptionImageSrc: string;
  extraNotes: string;
};

function createInitialAdminMarketDraft(): AdminMarketDraft {
  return {
    categoryId: predictionMarketCategories[0]?.id ?? "crypto",
    title: "",
    resolutionLabel: "Resolved by Octopus Market admin after the event result is confirmed",
    eventStartAt: "",
    mode: "vs",
    enableThirdOption: false,
    leftCompetitorName: "",
    leftCompetitorImageSrc: "",
    rightCompetitorName: "",
    rightCompetitorImageSrc: "",
    singleName: "",
    singleImageSrc: "",
    firstOdds: "1.8",
    secondOdds: "1.8",
    thirdOptionLabel: "X",
    thirdOptionOdds: "3.2",
    thirdOptionImageSrc: "",
    extraNotes: "",
  };
}

function readImageFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("image-read-failed"));
    };

    reader.onerror = () => reject(new Error("image-read-failed"));
    reader.readAsDataURL(file);
  });
}

function buildAdminCreatedMarketId(title: string) {
  return `admin-market-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}-${Date.now().toString(36)}`;
}

function buildAdminCreatedMarketOptions(draft: AdminMarketDraft): PredictionMarketOption[] {
  if (draft.mode === "vs") {
    const nextOptions: PredictionMarketOption[] = [
      {
        id: "left-win",
        label: `${draft.leftCompetitorName.trim() || "Team A"} Win`,
        oddsMultiplier: Number(draft.firstOdds),
        description: draft.extraNotes.trim() || "Admin-created left team side.",
        logoSrc: draft.leftCompetitorImageSrc.trim() || undefined,
        initialVolumeUsd: 0,
      },
      {
        id: "right-win",
        label: `${draft.rightCompetitorName.trim() || "Team B"} Win`,
        oddsMultiplier: Number(draft.secondOdds),
        description: draft.extraNotes.trim() || "Admin-created right team side.",
        logoSrc: draft.rightCompetitorImageSrc.trim() || undefined,
        initialVolumeUsd: 0,
      },
    ];

    if (draft.enableThirdOption) {
      nextOptions.splice(1, 0, {
        id: "third-option",
        label: draft.thirdOptionLabel.trim() || "X",
        oddsMultiplier: Number(draft.thirdOptionOdds),
        description: draft.extraNotes.trim() || "Admin-created third option.",
        logoSrc: draft.thirdOptionImageSrc.trim() || undefined,
        initialVolumeUsd: 0,
      });
    }

    return nextOptions;
  }

  const nextOptions: PredictionMarketOption[] = [
    {
      id: "yes",
      label: "Yes",
      oddsMultiplier: Number(draft.firstOdds),
      description: draft.extraNotes.trim() || "Admin-created yes side.",
      initialVolumeUsd: 0,
    },
    {
      id: "no",
      label: "No",
      oddsMultiplier: Number(draft.secondOdds),
      description: draft.extraNotes.trim() || "Admin-created no side.",
      initialVolumeUsd: 0,
    },
  ];

  if (draft.enableThirdOption) {
    nextOptions.push({
      id: "third-option",
      label: draft.thirdOptionLabel.trim() || "Third option",
      oddsMultiplier: Number(draft.thirdOptionOdds),
      description: draft.extraNotes.trim() || "Admin-created third option.",
      logoSrc: draft.thirdOptionImageSrc.trim() || undefined,
      initialVolumeUsd: 0,
    });
  }

  return nextOptions;
}

export function BinaryPredictionStudio({
  isWalletConnected,
  walletAddress,
  walletUsername,
  onConnectWallet,
  selectedCategoryId,
  selectedMarketId,
}: BinaryPredictionStudioProps) {
  const [activeCategoryId, setActiveCategoryId] = useState(predictionMarketCategories[0]?.id ?? "crypto");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [selections, setSelections] = useState<Record<string, string | undefined>>({});
  const [history, setHistory] = useState<PredictionHistoryEntry[]>(() => readPredictionHistory());
  const [resolutions, setResolutions] = useState<Record<string, PredictionResolutionRecord>>(() => readPredictionResolutions());
  const [adminNotifications, setAdminNotifications] = useState<AdminPaymentNotification[]>(() => readAdminPaymentNotifications());
  const [adminCreatedMarkets, setAdminCreatedMarkets] = useState<AdminCreatedPredictionMarket[]>(() =>
    readAdminCreatedPredictionMarkets()
  );
  const [storeHydrated, setStoreHydrated] = useState(() => isStoreHydrated());
  const [signingMarketId, setSigningMarketId] = useState<string | null>(null);
  const [claimingEntryId, setClaimingEntryId] = useState<string | null>(null);
  const [selectedTokens, setSelectedTokens] = useState<Record<string, BetToken>>({});
  const [latestPaymentRequest, setLatestPaymentRequest] = useState<PaymentRequest | null>(null);
  const [isRecoveringPendingPayments, setIsRecoveringPendingPayments] = useState(false);
  // Ref pour éviter le double-enregistrement même si le state history est stale
  const reportedReferencesRef = useRef<Set<string>>(new Set());
  // Tick every 60s so visibleQuestions re-sorts when a market flips live
  const [sortTick, setSortTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSortTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const [showAdminMarketForm, setShowAdminMarketForm] = useState(false);
  const [adminMarketDraft, setAdminMarketDraft] = useState<AdminMarketDraft>(() => createInitialAdminMarketDraft());

  useEffect(() => {
    return subscribeToAdminStorage(() => {
      setAdminNotifications(readAdminPaymentNotifications());
    });
  }, []);

  useEffect(() => {
    return subscribeToPredictionMarketStorage(() => {
      setAdminCreatedMarkets(readAdminCreatedPredictionMarkets());
      setHistory(readPredictionHistory());
      setResolutions(readPredictionResolutions());
      setStoreHydrated(isStoreHydrated());
    });
  }, []);

  useEffect(() => {
    if (!selectedCategoryId) {
      return;
    }

    setActiveCategoryId(selectedCategoryId);
  }, [selectedCategoryId]);

  useEffect(() => {
    if (!selectedMarketId || typeof window === "undefined") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      window.document.getElementById(`prediction-market-card-${selectedMarketId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [selectedMarketId, activeCategoryId]);

  const activeCategory =
    predictionMarketCategories.find((category) => category.id === activeCategoryId) ?? predictionMarketCategories[0];

  const allPredictionMarkets = useMemo(
    () => [...predictionMarketQuestions, ...adminCreatedMarkets],
    [adminCreatedMarkets]
  );

  const visibleQuestions = useMemo(() => {
    void sortTick; // re-sort every 60s so live markets bubble up automatically
    const now = Date.now();
    const filtered = allPredictionMarkets.filter((question) => question.categoryId === activeCategoryId && !question.isResolved);

    return [...filtered].sort((a, b) => {
      const getMs = (m: typeof a) =>
        m.eventStartAt ? new Date(m.eventStartAt).getTime() : null;
      const aMs = getMs(a);
      const bMs = getMs(b);
      // No date → always last
      if (aMs === null && bMs === null) return 0;
      if (aMs === null) return 1;
      if (bMs === null) return -1;
      // Both have a date: sort by distance to now (live = 0 remaining, upcoming = positive remaining)
      const aRemaining = Math.max(0, aMs - now);
      const bRemaining = Math.max(0, bMs - now);
      return aRemaining - bRemaining;
    });
  }, [activeCategoryId, allPredictionMarkets, sortTick]);

  const ownerWalletConnected = walletAddress === predictionMarketTreasuryAddress;

  const [allMarketsAdmin, setAllMarketsAdmin] = useState<PredictionMarketRow[]>([]);
  const [adminClaims, setAdminClaims] = useState<ReferralCommissionClaimRow[]>([]);
  const [isLoadingClaims, setIsLoadingClaims] = useState(false);
  const [isLoadingAdminMarkets, setIsLoadingAdminMarkets] = useState(false);

  const derivedHistory = useMemo(
    () =>
      history.map((entry) => {
        const resolution = resolutions[entry.marketId];
        const paymentNotification = adminNotifications.find(
          (notification) => notification.paymentReference === entry.paymentReference
        );
        const adminStatus = paymentNotification?.status ?? "pending";
        const isResolved = Boolean(resolution);
        const isWinner = isResolved && resolution.outcomeId === entry.selectionId && adminStatus === "approved";
        const isLoser = isResolved && resolution.outcomeId !== entry.selectionId && adminStatus === "approved";
        const canClaim = isWinner && !entry.claimedAt;

        return {
          ...entry,
          resolution,
          adminStatus,
          isResolved,
          isWinner,
          isLoser,
          canClaim,
        };
      }),
    [adminNotifications, history, resolutions]
  );

  const handleReportValidatedPayment = useCallback((paymentRequest: PaymentRequest) => {
    // Guard contre le double-enregistrement (state stale ou recovery concurrente)
    if (reportedReferencesRef.current.has(paymentRequest.reference)) {
      return;
    }
    reportedReferencesRef.current.add(paymentRequest.reference);

    const historyEntry = buildPredictionHistoryEntryFromPaymentRequest(paymentRequest);
    appendPredictionHistoryEntry(historyEntry);
    const notification = notifyAdminForValidatedPayment(paymentRequest);

    void (async () => {
      await Promise.allSettled([
        syncPredictionHistoryToCentralRegistry(historyEntry),
        persistAdminNotificationsStateToServer(),
      ]);

      setHistory(readPredictionHistory());
      setAdminNotifications(readAdminPaymentNotifications());
      // Effacer latestPaymentRequest pour que recoverPredictionPayments ne le reprenne pas
      setLatestPaymentRequest(null);
      toast.success(`Bet recorded · ${historyEntry.marketTitle}`, {
        description: `Position on "${historyEntry.selectionLabel}" pending admin validation.`,
        duration: 5000,
      });
      redirectToPredictionHistory();
    })();
  }, []);

  const recoverPredictionPayments = useCallback(async () => {
    if (isRecoveringPendingPayments || !latestPaymentRequest || latestPaymentRequest.kind !== "prediction") {
      return;
    }

    if (
      history.some((entry) => entry.paymentReference === latestPaymentRequest.reference) ||
      reportedReferencesRef.current.has(latestPaymentRequest.reference)
    ) {
      return;
    }

    try {
      setIsRecoveringPendingPayments(true);
      const paymentModule = await loadPaymentModule();
      const foundReference = await paymentModule.findReference(latestPaymentRequest.reference);

      if (!foundReference?.signature) {
        return;
      }

      await paymentModule.validateTransfer(foundReference.signature, {
        recipient: latestPaymentRequest.recipient,
        amount: latestPaymentRequest.amount,
        reference: latestPaymentRequest.reference,
        currency: latestPaymentRequest.currency,
        tokenMint: latestPaymentRequest.tokenMint,
        tokenDecimals: latestPaymentRequest.tokenDecimals,
      });

      const validatedPaymentRequest = await paymentModule.fetchTransaction(latestPaymentRequest.id);

      if (validatedPaymentRequest?.status === "validated") {
        handleReportValidatedPayment(validatedPaymentRequest);
        // Credit OCTO + referral commission in recovery path (fire-and-forget)
        // CLT bets: OCTO deferred to admin approval — only credit for USDC here
        if (walletAddress) {
          const meta = (latestPaymentRequest.metadata ?? {}) as Record<string, unknown>;
          const stake = typeof meta["stake"] === "number" ? meta["stake"] : 0;
          const recoveredReserveFee = typeof meta["reserveFee"] === "number" ? meta["reserveFee"] : 0;
          const recoveredToken = (meta["token"] as BetToken | undefined) ?? "usdc";
          if (stake > 0 && recoveredToken !== "clawdtrust") {
            void creditBetOcto(walletAddress, stake);
          }
          // Commission parrain créditée à l'approbation admin (pas ici)
        }
      }
    } catch {
      return;
    } finally {
      setIsRecoveringPendingPayments(false);
    }
  }, [handleReportValidatedPayment, history, isRecoveringPendingPayments, latestPaymentRequest]);

  useEffect(() => {
    void recoverPredictionPayments();
  }, [recoverPredictionPayments]);

  useEffect(() => {
    if (!ownerWalletConnected) return;
    setIsLoadingAdminMarkets(true);
    getAllMarketsAdmin()
      .then(setAllMarketsAdmin)
      .catch((err) => console.warn("[admin-markets]", err))
      .finally(() => setIsLoadingAdminMarkets(false));
  }, [ownerWalletConnected]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void recoverPredictionPayments();
      }
    };

    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [recoverPredictionPayments]);

  const handleChooseSelection = (marketId: string, selectionId: string) => {
    setSelections((currentSelections) => ({
      ...currentSelections,
      [marketId]: selectionId,
    }));
  };

  const handleAmountChange = (marketId: string, value: string) => {
    setAmounts((currentAmounts) => ({
      ...currentAmounts,
      [marketId]: value,
    }));
  };

  function handleAdminDraftChange<Key extends keyof AdminMarketDraft>(key: Key, value: AdminMarketDraft[Key]) {
    setAdminMarketDraft((currentValue) => ({
      ...currentValue,
      [key]: value,
    }));
  }

  const handleAdminMarketImageUpload = async (
    key: "leftCompetitorImageSrc" | "rightCompetitorImageSrc" | "singleImageSrc" | "thirdOptionImageSrc",
    fileList: FileList | null
  ) => {
    const nextFile = fileList?.[0];

    if (!nextFile) {
      return;
    }

    try {
      const nextImageSrc = await readImageFileAsDataUrl(nextFile);
      handleAdminDraftChange(key, nextImageSrc);
    } catch {
      toast.error("Invalid image", { description: "The image could not be loaded. Try another file." });
    }
  };

  const renderMarketHeadline = (market: PredictionMarketQuestion) => {
    if (market.visualType === "vs") {
      return (
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-zinc-950 dark:text-white">
          {market.leftCompetitorImageSrc ? (
            <img
              src={market.leftCompetitorImageSrc}
              alt={`${market.leftCompetitorName ?? "Left team"} logo`}
              className="size-5 shrink-0 rounded-full border border-white/60 object-cover"
            />
          ) : null}
          <span className="min-w-0 flex-1 line-clamp-2">{market.leftCompetitorName ?? "Team A"}</span>
          <span className="shrink-0 text-zinc-400 dark:text-zinc-500">vs</span>
          {market.rightCompetitorImageSrc ? (
            <img
              src={market.rightCompetitorImageSrc}
              alt={`${market.rightCompetitorName ?? "Right team"} logo`}
              className="size-5 shrink-0 rounded-full border border-white/60 object-cover"
            />
          ) : null}
          <span className="min-w-0 flex-1 line-clamp-2">{market.rightCompetitorName ?? "Team B"}</span>
        </div>
      );
    }

    return (
      <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-zinc-950 dark:text-white">
        {market.singleImageSrc ? (
          <img
            src={market.singleImageSrc}
            alt={`${market.singleName ?? market.title} logo`}
            className="size-5 shrink-0 rounded-full border border-white/60 object-cover"
          />
        ) : null}
        <span className="min-w-0 line-clamp-2">{market.singleName ?? market.title}</span>
      </div>
    );
  };

  const handleCreateAdminMarket = async () => {
    if (!ownerWalletConnected || !walletAddress) {
      toast.error("Access denied", { description: "Only the admin wallet can create a market." });
      return;
    }

    const trimmedTitle = adminMarketDraft.title.trim();

    if (!trimmedTitle) {
      toast.error("Missing fields", { description: "Add a title before publishing." });
      return;
    }

    if (adminMarketDraft.mode === "vs") {
      if (!adminMarketDraft.leftCompetitorName.trim() || !adminMarketDraft.rightCompetitorName.trim()) {
        toast.error("Missing names", { description: "Add both team names for a VS market." });
        return;
      }
    }

    if (adminMarketDraft.mode === "simple" && !adminMarketDraft.singleName.trim()) {
      toast.error("Missing name", { description: "Add the subject name for this simple market." });
      return;
    }

    const nextOptions = buildAdminCreatedMarketOptions(adminMarketDraft);

    if (nextOptions.some((option) => !Number.isFinite(option.oddsMultiplier) || option.oddsMultiplier <= 1)) {
      toast.error("Invalid odds", { description: "Each option must have a valid multiplier greater than 1." });
      return;
    }

    const nextMarket: AdminCreatedPredictionMarket = {
      id: buildAdminCreatedMarketId(trimmedTitle),
      categoryId: adminMarketDraft.categoryId,
      title: trimmedTitle,
      marketType: adminMarketDraft.enableThirdOption
        ? "three-way"
        : adminMarketDraft.mode === "vs"
          ? "threshold"
          : "yes-no",
      visualType: adminMarketDraft.mode,
      leftCompetitorName: adminMarketDraft.mode === "vs" ? adminMarketDraft.leftCompetitorName.trim() : undefined,
      leftCompetitorImageSrc:
        adminMarketDraft.mode === "vs" && adminMarketDraft.leftCompetitorImageSrc.trim()
          ? adminMarketDraft.leftCompetitorImageSrc.trim()
          : undefined,
      rightCompetitorName: adminMarketDraft.mode === "vs" ? adminMarketDraft.rightCompetitorName.trim() : undefined,
      rightCompetitorImageSrc:
        adminMarketDraft.mode === "vs" && adminMarketDraft.rightCompetitorImageSrc.trim()
          ? adminMarketDraft.rightCompetitorImageSrc.trim()
          : undefined,
      singleName: adminMarketDraft.mode === "simple" ? adminMarketDraft.singleName.trim() : undefined,
      singleImageSrc:
        adminMarketDraft.mode === "simple" && adminMarketDraft.singleImageSrc.trim()
          ? adminMarketDraft.singleImageSrc.trim()
          : undefined,
      resolutionLabel: adminMarketDraft.resolutionLabel,
      eventStartAt: adminMarketDraft.eventStartAt.trim()
        ? new Date(adminMarketDraft.eventStartAt.trim()).toISOString()
        : null,
      options: nextOptions,
      createdAt: Date.now(),
      createdByWallet: walletAddress,
      isAdminCreated: true,
      isResolved: false,
    };

    const commitResult = await createPredictionMarketOnServer(nextMarket, walletAddress);

    if (!commitResult) {
      toast.error("Database error", { description: "The market could not be saved. Please try again." });
      return;
    }

    setAdminCreatedMarkets(commitResult.markets);
    setResolutions(commitResult.resolutions);
    void appendCentralAdminLog({
      adminWallet: walletAddress,
      action: "create_prediction",
      targetId: nextMarket.id,
      details: JSON.stringify({
        categoryId: nextMarket.categoryId,
        title: nextMarket.title,
        marketType: nextMarket.marketType,
        visualType: nextMarket.visualType,
        options: nextMarket.options?.map((option) => ({
          id: option.id,
          label: option.label,
          oddsMultiplier: option.oddsMultiplier,
        })),
      }),
    });
    setActiveCategoryId(nextMarket.categoryId);
    setShowAdminMarketForm(false);
    setAdminMarketDraft(createInitialAdminMarketDraft());
    toast.success(`Market published`, {
      description: `${nextMarket.title} is now visible in the ${predictionMarketCategories.find((c) => c.id === nextMarket.categoryId)?.label ?? "selected"} section.`,
    });
  };

  const handleResolveMarket = async (market: PredictionMarketQuestion, outcomeId: string) => {
    if (!ownerWalletConnected || !walletAddress) {
      toast.error("Access denied", { description: "Only the admin wallet can resolve a market." });
      return;
    }

    const resolvedOption = getMarketOptions(market, 0).find((option) => option.id === outcomeId);

    const commitResult = await resolvePredictionMarketOnServer(market.id, outcomeId, walletAddress);

    if (!commitResult) {
      toast.error("Database error", { description: "The result could not be saved. Please try again." });
      return;
    }

    setAdminCreatedMarkets(commitResult.markets);
    setResolutions(commitResult.resolutions);
    const resolvedRecord = commitResult.resolutions[market.id];

    if (resolvedRecord) {
      syncPredictionEntriesForResolvedMarket({
        marketId: market.id,
        outcomeId: resolvedRecord.outcomeId,
        resolvedAt: resolvedRecord.resolvedAt,
        resolvedByWallet: resolvedRecord.resolvedByWallet,
      });
    }
    void appendCentralAdminLog({
      adminWallet: walletAddress,
      action: "resolve_prediction",
      targetId: market.id,
      details: JSON.stringify({
        marketTitle: market.title,
        outcomeId,
        outcomeLabel: resolvedOption?.label ?? outcomeId,
      }),
    });

    toast.success(`Market resolved`, {
      description: `${market.title} — winning side: ${resolvedOption?.label ?? outcomeId}. Winnings are now claimable.`,
    });

    // Credit 5% of each losing bet amount to the referrer (fire-and-forget)
    void (async () => {
      try {
        const allHistory = await getAllPredictionHistoryAdmin();
        const losers = allHistory.filter(
          (h) => h.market_id === market.id && h.selection_id !== outcomeId && h.admin_decision_status === "approved"
        );
        for (const loser of losers) {
          void creditReferralCommission(
            loser.wallet_address,
            "loss_commission",
            loser.amount,
            loser.payment_reference,
            (loser.token as BetToken) ?? "usdc"
          );
        }
      } catch (err) {
        console.error("[handleResolveMarket] loss commission crediting failed:", err);
      }
    })();
  };

  const handleDeleteMarket = async (market: PredictionMarketQuestion) => {
    if (!ownerWalletConnected || !walletAddress) {
      toast.error("Access denied", { description: "Only the admin wallet can delete a market." });
      return;
    }

    const commitResult = await deletePredictionMarketOnServer(market.id, walletAddress);

    if (!commitResult) {
      toast.error("Database error", { description: "The market could not be deleted. Please try again." });
      return;
    }

    setAdminCreatedMarkets(commitResult.markets);
    setResolutions(commitResult.resolutions);
    void appendCentralAdminLog({
      adminWallet: walletAddress,
      action: "remove_prediction",
      targetId: market.id,
      details: JSON.stringify({
        marketTitle: market.title,
        categoryId: market.categoryId,
      }),
    });

    toast.success(`Market deleted`, { description: `${market.title} has been removed from the database.` });
  };

  const handleClaimReward = async (entry: PredictionHistoryEntry) => {
    let connectedWallet = walletAddress;

    if (!connectedWallet) {
      connectedWallet = await onConnectWallet();
    }

    if (!connectedWallet) {
      toast.error("Wallet required", { description: "Connect the winning wallet to claim your reward." });
      return;
    }

    const resolution = resolutions[entry.marketId];
    const paymentNotification = adminNotifications.find(
      (notification) => notification.paymentReference === entry.paymentReference
    );

    if (!resolution) {
      toast.error("Market not resolved", { description: "This market has not been resolved by the admin yet." });
      return;
    }

    if (paymentNotification?.status !== "approved") {
      toast.error("Payment not approved", { description: "The payment must be approved by the admin before claiming." });
      return;
    }

    if (connectedWallet !== entry.walletAddress) {
      toast.error("Wrong wallet", { description: "Use the same wallet that placed the winning bet." });
      return;
    }

    if (resolution.outcomeId !== entry.selectionId) {
      toast.error("Losing bet", { description: "This bet is not on the winning side." });
      return;
    }

    if (entry.claimedAt) {
      toast.error("Already claimed", { description: "This reward has already been claimed." });
      return;
    }

    try {
      setClaimingEntryId(entry.id);
      await new Promise((resolve) => {
        window.setTimeout(resolve, 800);
      });

      const claimReference = buildClaimReference();
      updatePredictionHistoryEntry(entry.id, (currentEntry) => ({
        ...currentEntry,
        claimedAt: Date.now(),
        claimReference,
        payoutRecordedAt: Date.now(),
        resultStatus: "claimed",
      }));
      setHistory(readPredictionHistory());

      toast.success(`Reward claimed`, {
        description: `${entry.marketTitle} — ${entry.token === "clawdtrust" ? formatClawdTrust(entry.netReward) : formatCurrency(entry.netReward)} net (after ${entry.claimFeeRate}% fee). Pending admin payment.`,
        duration: 6000,
      });
    } finally {
      setClaimingEntryId(null);
    }
  };

  const handleConfirmPosition = async (market: PredictionMarketQuestion, marketIndex: number) => {
    if (walletAddress && readCachedCentralWalletRecord(walletAddress)?.status === "suspended") {
      toast.error("Wallet suspended", { description: "This wallet is suspended and cannot place bets." });
      return;
    }

    // Bloquer les paris une fois l'événement démarré
    if (market.eventStartAt && Date.now() >= new Date(market.eventStartAt).getTime()) {
      toast.error("Market closed", { description: "Predictions are locked — the event is underway." });
      return;
    }

    const rawAmount = amounts[market.id] ?? "";
    const amount = Number(rawAmount);
    const selectedOptionId = selections[market.id];
    const marketOptions = getMarketOptions(market, marketIndex);
    const selectedOption = marketOptions.find((option) => option.id === selectedOptionId);

    if (!selectedOption) {
      toast.error("Missing selection", { description: `Choose an option for ${market.title}.` });
      return;
    }

    const isCltBet = (selectedTokens[market.id] ?? "usdc") === "clawdtrust";
    const minStake = isCltBet ? predictionMarketMinStakeClt : predictionMarketMinStakeUsd;
    if (!Number.isFinite(amount) || amount < minStake || (!isCltBet && amount > predictionMarketMaxStakeUsd)) {
      toast.error("Invalid amount", {
        description: isCltBet
          ? `Minimum ${formatClawdTrust(predictionMarketMinStakeClt)}.`
          : `Enter an amount between ${formatCurrency(predictionMarketMinStakeUsd)} and ${formatCurrency(predictionMarketMaxStakeUsd)}.`,
      });
      return;
    }

    let connectedWallet = walletAddress;

    if (!connectedWallet) {
      connectedWallet = await onConnectWallet();
    }

    if (!connectedWallet) {
      toast.error("Wallet requis", { description: "Connectez un wallet Solana pour confirmer votre position." });
      return;
    }

    const provider = getSolanaProvider();

    if (!provider?.signAndSendTransaction && !provider?.signTransaction) {
      toast.error(`Wallet incompatible`, {
        description: `Ce wallet ne peut pas envoyer de ${paymentTokenSymbol} pour le moment.`,
      });
      return;
    }

    const reserveFee = calculatePercentageAmount(amount, predictionMarketReserveFeeRate);
    const totalChargeUsd = Number((amount + reserveFee).toFixed(2));
    const grossReward = Number((amount * selectedOption.oddsMultiplier).toFixed(2));
    const netReward = Number((grossReward * (1 - predictionMarketFeeRate / 100)).toFixed(2));

    const selectedToken: BetToken = selectedTokens[market.id] ?? "usdc";
    const tokenMint = selectedToken === "clawdtrust" ? SOLANA_CLAWDTRUST_MINT : solanaUsdcMintAddress;
    const tokenDecimals = selectedToken === "clawdtrust"
      ? (readCachedWalletSnapshot(connectedWallet)?.clawdtrustDecimals ?? 9)
      : 6;
    const tokenCurrency = selectedToken === "clawdtrust" ? "ClawdTrust" : "USDC";

    const paymentModule = await loadPaymentModule();

    const transferRequest = await paymentModule.buildTransaction({
      kind: "prediction",
      recipient: predictionMarketTreasuryAddress,
      amount: totalChargeUsd,
      walletAddress: connectedWallet,
      currency: tokenCurrency,
      tokenMint,
      tokenDecimals,
      label: "Octopus Market prediction market",
      message: `${market.title} · ${selectedOption.label}`,
      memo: `${activeCategory.label} market position`,
      metadata: {
        onChainTransfer: true,
        marketId: market.id,
        marketTitle: market.title,
        categoryLabel: activeCategory.label,
        selectionId: selectedOption.id,
        selectionLabel: selectedOption.label,
        payoutMultiple: selectedOption.oddsMultiplier,
        grossReward,
        netReward,
        claimFeeRate: predictionMarketFeeRate,
        stake: amount,
        reserveFee,
        totalChargeUsd: selectedToken === "usdc" ? totalChargeUsd : 0,
        totalChargeUsdc: selectedToken === "usdc" ? totalChargeUsd : 0,
        totalChargeClt: selectedToken === "clawdtrust" ? totalChargeUsd : 0,
        token: selectedToken,
        ...(walletUsername?.trim() ? { username: walletUsername.trim() } : {}),
      },
    });

    setLatestPaymentRequest(transferRequest);

    try {
      setSigningMarketId(market.id);

      await paymentModule.submitSolanaTransfer(transferRequest);

      const foundReference = await paymentModule.findReference(transferRequest.reference);

      if (!foundReference?.signature) {
        throw new Error("reference-not-found");
      }

      await paymentModule.validateTransfer(foundReference.signature, {
        recipient: predictionMarketTreasuryAddress,
        amount: totalChargeUsd,
        reference: transferRequest.reference,
        currency: tokenCurrency,
        tokenMint,
        tokenDecimals,
      });

      const storedValidatedTransfer = await paymentModule.fetchTransaction(transferRequest.id);

      if (!storedValidatedTransfer || storedValidatedTransfer.status !== "validated") {
        throw new Error("validated-transfer-required");
      }

      handleReportValidatedPayment(storedValidatedTransfer);

      // Credit OCTO for the confirmed bet (fire-and-forget, never blocks the user)
      // CLT bets: OCTO is credited on admin approval (not here), to apply the 500k CLT = 20 OCTO formula
      if (connectedWallet) {
        if (selectedToken !== "clawdtrust") {
          void creditBetOcto(connectedWallet, amount, selectedToken);
        }
        // Commission parrain créditée à l'approbation admin (pas ici)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (
        msg.includes("insufficient") ||
        msg.includes("0x1") ||
        msg.includes("custom program error: 0x1") ||
        msg.includes("not enough")
      ) {
        toast.error(`Fonds ${selectedToken === "clawdtrust" ? "ClawdTrust" : "USDC"} insuffisants`, {
          description: `Check your ${selectedToken === "clawdtrust" ? "ClawdTrust" : "USDC"} balance before placing this bet.`,
        });
      } else if (msg.includes("reference-not-found") || msg.includes("timeout") || msg.includes("timed out")) {
        toast.error("Confirmation expired", {
          description:
            "The transaction was not confirmed in time. If the amount was debited, it will reappear automatically on reconnection.",
          duration: 7000,
        });
      } else if (
        msg.includes("cancel") ||
        msg.includes("rejected") ||
        msg.includes("user rejected") ||
        msg.includes("denied")
      ) {
        toast.error("Transaction cancelled", {
          description: "The payment was rejected in Phantom.",
        });
      } else if (
        msg.includes("failed to fetch") ||
        msg.includes("dynamically imported") ||
        msg.includes("load failed") ||
        msg.includes("networkerror")
      ) {
        toast.error("Network error", {
          description: "The payment module could not be loaded. Check your connection and try again.",
        });
      } else {
        toast.error("Payment failed", {
          description: "The Phantom transfer failed or could not be validated on-chain.",
        });
      }
    } finally {
      setSigningMarketId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div id="prediction-market-studio" className="scroll-mt-32" />
      <div className="w-full">
        {ownerWalletConnected ? (
          <>
            <Card className="border-orange-200 bg-white text-zinc-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">All markets</CardTitle>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {allMarketsAdmin.length} market{allMarketsAdmin.length !== 1 ? "s" : ""} total — most recent first
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsLoadingAdminMarkets(true);
                    getAllMarketsAdmin()
                      .then(setAllMarketsAdmin)
                      .catch(console.error)
                      .finally(() => setIsLoadingAdminMarkets(false));
                  }}
                  className="shrink-0 rounded-xl border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-orange-300 dark:hover:bg-zinc-800"
                >
                  {isLoadingAdminMarkets ? "Loading…" : "Refresh"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdminMarketForm(true)}
                  className="shrink-0 rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-400"
                >
                  + Create
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingAdminMarkets && allMarketsAdmin.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/70 px-5 py-6 text-sm text-zinc-500 dark:border-white/10 dark:bg-black/20 dark:text-zinc-400">
                  Loading markets…
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-orange-200 dark:border-white/10">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-orange-200 bg-orange-50 dark:border-white/10 dark:bg-zinc-900">
                        <TableHead className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Title</TableHead>
                        <TableHead className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Category</TableHead>
                        <TableHead className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Status</TableHead>
                        <TableHead className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Options</TableHead>
                        <TableHead className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Result</TableHead>
                        <TableHead className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Event date</TableHead>
                        <TableHead className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Created</TableHead>
                        <TableHead className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allMarketsAdmin.map((m) => {
                        const opts = Array.isArray(m.options)
                          ? (m.options as { id: string; label: string }[])
                          : [];
                        const winningOption = m.is_resolved && m.resolution_outcome_id
                          ? opts.find((o) => o.id === m.resolution_outcome_id)
                          : null;
                        const category = predictionMarketCategories.find((c) => c.id === m.category_id);
                        return (
                          <TableRow key={m.id} className="border-orange-100 dark:border-white/10">
                            <TableCell className="max-w-[180px] truncate py-3 text-sm font-medium text-zinc-900 dark:text-white" title={m.title}>
                              {m.title}
                            </TableCell>
                            <TableCell className="py-3 text-xs text-zinc-600 dark:text-zinc-400">
                              {category?.label ?? m.category_id}
                            </TableCell>
                            <TableCell className="py-3">
                              {m.is_resolved ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                                  <CheckCircle2 className="size-3" /> Resolved
                                </span>
                              ) : m.is_active ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-400">
                                  <span className="size-1.5 rounded-full bg-orange-500" /> Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                  <XCircle className="size-3" /> Inactive
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-3 text-xs text-zinc-600 dark:text-zinc-400">
                              {opts.length > 0 ? (
                                <div className="flex flex-col gap-0.5">
                                  {opts.map((o) => (
                                    <span
                                      key={o.id}
                                      className={m.resolution_outcome_id === o.id ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""}
                                    >
                                      {o.label}
                                    </span>
                                  ))}
                                </div>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="py-3 text-xs">
                              {winningOption ? (
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{winningOption.label}</span>
                              ) : (
                                <span className="text-zinc-400">—</span>
                              )}
                            </TableCell>
                            <TableCell className="py-3 text-xs text-zinc-600 dark:text-zinc-400">
                              {m.event_start_at
                                ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(m.event_start_at))
                                : m.event_date_label ?? "—"}
                            </TableCell>
                            <TableCell className="py-3 text-xs text-zinc-500 dark:text-zinc-400">
                              {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(m.created_at))}
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="flex items-center gap-2">
                                {!m.is_resolved ? (
                                  <select
                                    defaultValue=""
                                    onChange={async (e) => {
                                      if (!e.target.value || !walletAddress) return;
                                      await resolvePredictionMarketOnServer(m.id, e.target.value, walletAddress);
                                      setIsLoadingAdminMarkets(true);
                                      getAllMarketsAdmin().then(setAllMarketsAdmin).catch(console.error).finally(() => setIsLoadingAdminMarkets(false));
                                    }}
                                    className="rounded-lg border border-orange-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-orange-400 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300"
                                  >
                                    <option value="">Resolve…</option>
                                    {opts.map((o) => (
                                      <option key={o.id} value={o.id}>{o.label}</option>
                                    ))}
                                  </select>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!walletAddress) return;
                                    await deletePredictionMarketOnServer(m.id, walletAddress);
                                    setAllMarketsAdmin((prev) => prev.filter((x) => x.id !== m.id));
                                  }}
                                  className="rounded-lg border border-red-200 bg-white p-1.5 text-red-500 hover:bg-red-50 dark:border-red-500/20 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-500/10"
                                  title="Delete"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {allMarketsAdmin.length === 0 && !isLoadingAdminMarkets && (
                    <div className="px-5 py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
                      No markets yet.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
            <Sheet open={showAdminMarketForm} onOpenChange={setShowAdminMarketForm}>
              <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
                <SheetHeader>
                  <SheetTitle>Create a market</SheetTitle>
                </SheetHeader>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div className="space-y-4 rounded-2xl border border-orange-100 bg-white p-4 dark:border-white/10 dark:bg-zinc-950/70">
                        <div>
                          <p className="text-sm font-semibold text-zinc-950 dark:text-white">Market basics</p>
                          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                            Choose the section, set the market title, then add the date and resolution rule users will see.
                          </p>
                        </div>

                        <label className="block text-xs uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                          Section
                        </label>
                        <select
                          value={adminMarketDraft.categoryId}
                          onChange={(event) => handleAdminDraftChange("categoryId", event.target.value)}
                          className="flex h-10 w-full rounded-2xl border border-orange-200 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-orange-300 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                        >
                          {predictionMarketCategories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.label}
                            </option>
                          ))}
                        </select>

                        <Input
                          value={adminMarketDraft.title}
                          onChange={(event) => handleAdminDraftChange("title", event.target.value)}
                          placeholder="Market title"
                          className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                        />

                        <div className="space-y-1.5">
                          <label className="block text-xs uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                            Event start — date &amp; time (optional)
                          </label>
                          <Input
                            type="datetime-local"
                            value={adminMarketDraft.eventStartAt}
                            onChange={(event) => handleAdminDraftChange("eventStartAt", event.target.value)}
                            className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                          />
                          <p className="text-[11px] leading-4 text-zinc-400 dark:text-zinc-500">
                            The date is auto-displayed on the card. Once reached: countdown switches to 🔴 LIVE and bets lock automatically.
                          </p>
                        </div>

                        <div className="space-y-3 rounded-2xl border border-orange-100 bg-orange-50/70 p-4 dark:border-white/10 dark:bg-black/20">
                          <div>
                            <p className="text-sm font-semibold text-zinc-950 dark:text-white">Market format</p>
                            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                              Pick the market structure first, then activate a third outcome only if this event needs three choices.
                            </p>
                          </div>
                          <div className="flex flex-col gap-3">
                            <Button
                              type="button"
                              variant={adminMarketDraft.mode === "vs" ? "default" : "outline"}
                              className={adminMarketDraft.mode === "vs" ? "min-h-14 w-full justify-start rounded-2xl bg-orange-500 px-4 py-3 text-left text-white hover:bg-orange-400" : "min-h-14 w-full justify-start rounded-2xl border-orange-200 bg-white px-4 py-3 text-left text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"}
                              onClick={() => handleAdminDraftChange("mode", "vs")}
                            >
                              <span className="block text-sm font-semibold">VS market</span>
                              <span className="mt-1 block text-xs opacity-80">Two teams, two logos, head-to-head event.</span>
                            </Button>
                            <Button
                              type="button"
                              variant={adminMarketDraft.mode === "simple" ? "default" : "outline"}
                              className={adminMarketDraft.mode === "simple" ? "min-h-14 w-full justify-start rounded-2xl bg-orange-500 px-4 py-3 text-left text-white hover:bg-orange-400" : "min-h-14 w-full justify-start rounded-2xl border-orange-200 bg-white px-4 py-3 text-left text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"}
                              onClick={() => handleAdminDraftChange("mode", "simple")}
                            >
                              <span className="block text-sm font-semibold">Simple market</span>
                              <span className="mt-1 block text-xs opacity-80">One subject, one circular logo, simple outcome flow.</span>
                            </Button>
                            <Button
                              type="button"
                              variant={adminMarketDraft.enableThirdOption ? "default" : "outline"}
                              className={adminMarketDraft.enableThirdOption ? "min-h-14 w-full justify-start rounded-2xl bg-orange-500 px-4 py-3 text-left text-white hover:bg-orange-400" : "min-h-14 w-full justify-start rounded-2xl border-orange-200 bg-white px-4 py-3 text-left text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"}
                              onClick={() =>
                                setAdminMarketDraft((currentValue) => ({
                                  ...currentValue,
                                  enableThirdOption: !currentValue.enableThirdOption,
                                  thirdOptionLabel:
                                    currentValue.thirdOptionLabel || (currentValue.mode === "vs" ? "X" : "Third option"),
                                }))
                              }
                            >
                              <span className="block text-sm font-semibold">
                                {adminMarketDraft.enableThirdOption ? "3 choices active" : "Enable 3 choices"}
                              </span>
                              <span className="mt-1 block text-xs opacity-80">Add a third outcome like X, draw, or a custom side.</span>
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 rounded-2xl border border-orange-100 bg-white p-4 dark:border-white/10 dark:bg-zinc-950/70">
                        <div>
                          <p className="text-sm font-semibold text-zinc-950 dark:text-white">Market options</p>
                          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                            Add the names, circular images, and odds that will appear on the live market card.
                          </p>
                        </div>

                        {adminMarketDraft.mode === "vs" ? (
                          <>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input
                                value={adminMarketDraft.leftCompetitorName}
                                onChange={(event) => handleAdminDraftChange("leftCompetitorName", event.target.value)}
                                placeholder="First team name"
                                className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                              />
                              <Input
                                type="file"
                                accept="image/*"
                                onChange={(event) => {
                                  void handleAdminMarketImageUpload("leftCompetitorImageSrc", event.target.files);
                                }}
                                className="border-orange-200 bg-white text-zinc-950 file:mr-3 file:rounded-full file:border-0 file:bg-orange-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-orange-700 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:file:bg-orange-500/15 dark:file:text-orange-300"
                              />
                            </div>
                            {adminMarketDraft.leftCompetitorImageSrc ? (
                              <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-white px-3 py-3 dark:border-white/10 dark:bg-zinc-950/80">
                                <img src={adminMarketDraft.leftCompetitorImageSrc} alt="First team preview" className="size-12 rounded-full object-cover" />
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">First team circular preview</span>
                              </div>
                            ) : null}
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input
                                value={adminMarketDraft.rightCompetitorName}
                                onChange={(event) => handleAdminDraftChange("rightCompetitorName", event.target.value)}
                                placeholder="Second team name"
                                className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                              />
                              <Input
                                type="file"
                                accept="image/*"
                                onChange={(event) => {
                                  void handleAdminMarketImageUpload("rightCompetitorImageSrc", event.target.files);
                                }}
                                className="border-orange-200 bg-white text-zinc-950 file:mr-3 file:rounded-full file:border-0 file:bg-orange-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-orange-700 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:file:bg-orange-500/15 dark:file:text-orange-300"
                              />
                            </div>
                            {adminMarketDraft.rightCompetitorImageSrc ? (
                              <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-white px-3 py-3 dark:border-white/10 dark:bg-zinc-950/80">
                                <img src={adminMarketDraft.rightCompetitorImageSrc} alt="Second team preview" className="size-12 rounded-full object-cover" />
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">Second team circular preview</span>
                              </div>
                            ) : null}
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input
                                type="number"
                                min="1.01"
                                step="0.01"
                                value={adminMarketDraft.firstOdds}
                                onChange={(event) => handleAdminDraftChange("firstOdds", event.target.value)}
                                placeholder="First team odds"
                                className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                              />
                              <Input
                                type="number"
                                min="1.01"
                                step="0.01"
                                value={adminMarketDraft.secondOdds}
                                onChange={(event) => handleAdminDraftChange("secondOdds", event.target.value)}
                                placeholder="Second team odds"
                                className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input
                                value={adminMarketDraft.singleName}
                                onChange={(event) => handleAdminDraftChange("singleName", event.target.value)}
                                placeholder="Single market name"
                                className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                              />
                              <Input
                                type="file"
                                accept="image/*"
                                onChange={(event) => {
                                  void handleAdminMarketImageUpload("singleImageSrc", event.target.files);
                                }}
                                className="border-orange-200 bg-white text-zinc-950 file:mr-3 file:rounded-full file:border-0 file:bg-orange-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-orange-700 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:file:bg-orange-500/15 dark:file:text-orange-300"
                              />
                            </div>
                            {adminMarketDraft.singleImageSrc ? (
                              <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-white px-3 py-3 dark:border-white/10 dark:bg-zinc-950/80">
                                <img src={adminMarketDraft.singleImageSrc} alt="Single market preview" className="size-12 rounded-full object-cover" />
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">Single logo circular preview</span>
                              </div>
                            ) : null}
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input
                                type="number"
                                min="1.01"
                                step="0.01"
                                value={adminMarketDraft.firstOdds}
                                onChange={(event) => handleAdminDraftChange("firstOdds", event.target.value)}
                                placeholder="Yes odds"
                                className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                              />
                              <Input
                                type="number"
                                min="1.01"
                                step="0.01"
                                value={adminMarketDraft.secondOdds}
                                onChange={(event) => handleAdminDraftChange("secondOdds", event.target.value)}
                                placeholder="No odds"
                                className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                              />
                            </div>
                          </>
                        )}

                        {adminMarketDraft.enableThirdOption ? (
                          <div className="space-y-3 rounded-2xl border border-orange-100 bg-orange-50/80 p-4 dark:border-white/10 dark:bg-black/20">
                            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                              Third option details
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input
                                value={adminMarketDraft.thirdOptionLabel}
                                onChange={(event) => handleAdminDraftChange("thirdOptionLabel", event.target.value)}
                                placeholder={adminMarketDraft.mode === "vs" ? "Draw label, for example X" : "Third choice label"}
                                className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                              />
                              <Input
                                type="number"
                                min="1.01"
                                step="0.01"
                                value={adminMarketDraft.thirdOptionOdds}
                                onChange={(event) => handleAdminDraftChange("thirdOptionOdds", event.target.value)}
                                placeholder="Third option odds"
                                className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                              />
                            </div>
                            <Input
                              type="file"
                              accept="image/*"
                              onChange={(event) => {
                                void handleAdminMarketImageUpload("thirdOptionImageSrc", event.target.files);
                              }}
                              className="border-orange-200 bg-white text-zinc-950 file:mr-3 file:rounded-full file:border-0 file:bg-orange-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-orange-700 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:file:bg-orange-500/15 dark:file:text-orange-300"
                            />
                            {adminMarketDraft.thirdOptionImageSrc ? (
                              <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-white px-3 py-3 dark:border-white/10 dark:bg-zinc-950/80">
                                <img src={adminMarketDraft.thirdOptionImageSrc} alt="Third option preview" className="size-12 rounded-full object-cover" />
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">Third option circular preview</span>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <Textarea
                          value={adminMarketDraft.extraNotes}
                          onChange={(event) => handleAdminDraftChange("extraNotes", event.target.value)}
                          placeholder="Optional option notes shown inside the market"
                          className="min-h-24 border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                        />

                        <div className="flex flex-wrap gap-3 pt-1">
                          <Button
                            type="button"
                            className="h-11 rounded-2xl bg-orange-500 px-4 text-white hover:bg-orange-400"
                            onClick={() => void handleCreateAdminMarket()}
                          >
                            <Plus className="size-4" />
                            Publish market
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 rounded-2xl border-orange-200 bg-white px-4 text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"
                            onClick={() => {
                              setAdminMarketDraft(createInitialAdminMarketDraft());
                              setShowAdminMarketForm(false);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
              </SheetContent>
            </Sheet>

            {/* ── Referral Commission Claims ──────────────────────────────── */}
            <Card className="border-orange-200 bg-white text-zinc-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">Referral Commission Claims</CardTitle>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      USDC payout requests from referrers — mark as paid after transfer
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLoadingClaims(true);
                      getAllCommissionClaims()
                        .then(setAdminClaims)
                        .catch(console.error)
                        .finally(() => setIsLoadingClaims(false));
                    }}
                    className="shrink-0 rounded-xl border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-orange-300 dark:hover:bg-zinc-800"
                  >
                    {isLoadingClaims ? "Loading…" : "Refresh"}
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                {adminClaims.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/70 px-5 py-6 text-center text-sm text-zinc-500 dark:border-white/10 dark:bg-black/20 dark:text-zinc-400">
                    No claims yet — click Refresh to load.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-orange-200 dark:border-white/10">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-orange-200 bg-orange-50 dark:border-white/10 dark:bg-zinc-900">
                          <TableHead className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Wallet</TableHead>
                          <TableHead className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Amount USDC</TableHead>
                          <TableHead className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Requested at</TableHead>
                          <TableHead className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Status</TableHead>
                          <TableHead className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {adminClaims.map((claim) => (
                          <TableRow key={claim.id} className="border-orange-100 dark:border-white/10">
                            <TableCell className="py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                              {claim.referrer_wallet.slice(0, 6)}…{claim.referrer_wallet.slice(-4)}
                            </TableCell>
                            <TableCell className="py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                              {Number(claim.total_usdc) > 0 ? `$${Number(claim.total_usdc).toFixed(4)}` : null}
                              {Number(claim.total_usdc) > 0 && Number(claim.total_clt ?? 0) > 0 ? " + " : null}
                              {Number(claim.total_clt ?? 0) > 0 ? `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(claim.total_clt))} ClawdTrust` : null}
                            </TableCell>
                            <TableCell className="py-3 text-xs text-zinc-500 dark:text-zinc-400">
                              {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(claim.created_at))}
                            </TableCell>
                            <TableCell className="py-3">
                              {claim.status === "paid" ? (
                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                                  Paid
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                                  Pending
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-3">
                              {claim.status === "pending" && walletAddress ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void markCommissionClaimPaid(claim.id, walletAddress).then((res) => {
                                      if (res.success) {
                                        setAdminClaims((prev) =>
                                          prev.map((c) =>
                                            c.id === claim.id
                                              ? { ...c, status: "paid", paid_at: new Date().toISOString(), paid_by_wallet: walletAddress }
                                              : c
                                          )
                                        );
                                        toast.success("Claim marked as paid");
                                      } else {
                                        toast.error("Failed", { description: res.error });
                                      }
                                    });
                                  }}
                                  className="rounded-xl bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                                >
                                  Mark as Paid
                                </button>
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
              </CardContent>
            </Card>
          </>
        ) : (
        <div className="space-y-6">

            <div className={visibleQuestions.length >= 6 ? "grid gap-4 lg:grid-cols-3" : visibleQuestions.length >= 4 ? "grid gap-4 lg:grid-cols-2" : "space-y-4"}>
              {visibleQuestions.length === 0 ? (
                !storeHydrated ? (
                  <div className="space-y-4">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="rounded-2xl border border-orange-100 bg-orange-50/40 p-5 dark:border-white/10 dark:bg-white/5">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="h-2.5 w-36 animate-pulse rounded-full bg-orange-100 dark:bg-white/10" style={{ animationDelay: `${i * 80}ms` }} />
                          <div className="h-5 w-14 animate-pulse rounded-full bg-orange-100 dark:bg-white/10" style={{ animationDelay: `${i * 80 + 20}ms` }} />
                        </div>
                        <div className="mb-4 flex items-center gap-2">
                          <div className="size-6 animate-pulse rounded-full bg-orange-100 dark:bg-white/10" style={{ animationDelay: `${i * 80 + 40}ms` }} />
                          <div className="h-3.5 w-20 animate-pulse rounded-full bg-orange-100 dark:bg-white/10" style={{ animationDelay: `${i * 80 + 50}ms` }} />
                          <div className="h-2.5 w-3 animate-pulse rounded-full bg-orange-100 dark:bg-white/10" />
                          <div className="h-3.5 w-20 animate-pulse rounded-full bg-orange-100 dark:bg-white/10" style={{ animationDelay: `${i * 80 + 60}ms` }} />
                          <div className="size-6 animate-pulse rounded-full bg-orange-100 dark:bg-white/10" style={{ animationDelay: `${i * 80 + 70}ms` }} />
                        </div>
                        <div className="mb-4 grid grid-cols-2 gap-2">
                          {[0, 1].map((j) => (
                            <div key={j} className="rounded-2xl border border-orange-100 bg-white p-3 dark:border-white/10 dark:bg-zinc-950/80">
                              <div className="mb-2 flex items-center justify-between">
                                <div className="size-5 animate-pulse rounded-full bg-orange-100 dark:bg-white/10" style={{ animationDelay: `${i * 80 + j * 40}ms` }} />
                                <div className="h-2.5 w-7 animate-pulse rounded-full bg-orange-100 dark:bg-white/10" style={{ animationDelay: `${i * 80 + j * 40 + 20}ms` }} />
                              </div>
                              <div className="h-2.5 w-full animate-pulse rounded-full bg-orange-100 dark:bg-white/10" style={{ animationDelay: `${i * 80 + j * 40 + 30}ms` }} />
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-end">
                          <div className="h-8 w-24 animate-pulse rounded-full bg-orange-100 dark:bg-white/10" style={{ animationDelay: `${i * 80 + 90}ms` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-orange-200 bg-white px-5 py-6 text-sm leading-7 text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-400">
                    No live bets are open in this section yet. Add a new market from the admin panel and it will appear here automatically.
                  </div>
                )
              ) : null}

              {visibleQuestions.map((market, index) => {
                const amountValue = amounts[market.id] ?? "";
                const chosenSelectionId = selections[market.id];
                const numericAmount = Number(amountValue);
                const marketOptions = getMarketOptions(market, index);
                const selectedToken: BetToken = selectedTokens[market.id] ?? "usdc";
                const minStakeForToken = selectedToken === "clawdtrust" ? predictionMarketMinStakeClt : predictionMarketMinStakeUsd;
                const stakePreviewAmount =
                  Number.isFinite(numericAmount) && numericAmount >= minStakeForToken
                    ? numericAmount
                    : minStakeForToken;
                const reserveFee = Number.isFinite(numericAmount)
                  ? calculatePercentageAmount(numericAmount, predictionMarketReserveFeeRate)
                  : 0;
                const totalCharge = Number.isFinite(numericAmount) ? Number((numericAmount + reserveFee).toFixed(2)) : 0;
                const optionSummaries = buildOptionSummaries(
                  market,
                  marketOptions,
                  history,
                  adminNotifications,
                  stakePreviewAmount,
                  selectedToken
                );
                const isSigning = signingMarketId === market.id;
                const resolution = resolutions[market.id];
                const resolvedOption = resolution
                  ? marketOptions.find((option) => option.id === resolution.outcomeId)
                  : undefined;
                const isMarketLive =
                  !resolution &&
                  Boolean(market.eventStartAt) &&
                  Date.now() >= new Date(market.eventStartAt!).getTime();

                return (
                  <Card
                    key={market.id}
                    id={`prediction-market-card-${market.id}`}
                    className={`overflow-hidden text-zinc-950 shadow-none dark:text-white ${
                      selectedMarketId === market.id
                        ? "border-orange-400 bg-orange-100/80 ring-1 ring-orange-300 dark:border-orange-400/50 dark:bg-orange-500/10 dark:ring-orange-400/30"
                        : "border-orange-200 bg-orange-50/60 dark:border-white/10 dark:bg-black/20"
                    }`}
                  >
                    <CardContent className="space-y-4 p-5">
                      {/* Market header + pill */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-xs font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-300">
                            {market.title}
                          </p>
                          <div className="mt-1.5">{renderMarketHeadline(market)}</div>
                        </div>
                        {isMarketLive ? (
                          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                            <span className="relative flex size-1.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                            </span>
                            LIVE
                          </span>
                        ) : market.eventStartAt ? (
                          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-orange-300">
                            ⏳ <MarketCountdownText eventStartAt={market.eventStartAt} />
                          </span>
                        ) : null}
                      </div>

                      {/* Option buttons */}
                      <div className={`grid gap-2 ${marketOptions.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                        {optionSummaries.map((option) => {
                          const isSelected = chosenSelectionId === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => handleChooseSelection(market.id, option.id)}
                              className={`flex flex-col gap-2 overflow-hidden rounded-2xl border px-3 py-3 text-left transition ${getSelectionClasses(option.id, isSelected)}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                {option.logoSrc ? (
                                  <img
                                    src={option.logoSrc}
                                    alt={`${option.label} logo`}
                                    className="size-5 shrink-0 rounded-full border border-white/60 object-cover"
                                  />
                                ) : <span className="size-5 shrink-0" />}
                                <span className={`shrink-0 text-sm font-bold leading-none ${isSelected ? "text-white" : "text-zinc-950 dark:text-white"}`}>×{option.oddsMultiplier}</span>
                              </div>
                              <span className={`line-clamp-2 text-xs font-semibold leading-tight ${isSelected ? "text-white" : "text-zinc-800 dark:text-zinc-100"}`}>{option.label}</span>
                              <p className={`text-[9px] leading-none ${isSelected ? "text-white/60" : "text-zinc-400 dark:text-zinc-500"}`}>
                                <span className="uppercase tracking-[0.06em]">Vol.</span> {selectedToken === "clawdtrust" ? formatClawdTrust(option.liveVolumeUsd) : formatCurrency(option.liveVolumeUsd)}
                              </p>
                            </button>
                          );
                        })}
                      </div>

                      {/* Action zone or Event in progress pill */}
                      {isMarketLive ? (
                        <>
                          <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">Predictions are closed during the event.</p>
                          <div className="flex justify-end">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                              <span className="relative flex size-1.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                              </span>
                              Event in progress
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <Separator className="border-orange-100 dark:border-white/10" />
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedTokens((prev) => ({ ...prev, [market.id]: "usdc" }))}
                                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${selectedToken === "usdc" ? "bg-orange-500 text-white" : "border border-orange-200 bg-white text-zinc-700 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}
                              >
                                <img src="/usdc-coin.png" alt="USDC" className="size-4 rounded-full object-cover" />
                                USDC
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedTokens((prev) => ({ ...prev, [market.id]: "clawdtrust" }))}
                                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${selectedToken === "clawdtrust" ? "bg-orange-500 text-white" : "border border-orange-200 bg-white text-zinc-700 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}
                              >
                                <img src="/clawdtrust-coin.png" alt="ClawdTrust" className="size-4 rounded-full object-cover" />
                                ClawdTrust
                              </button>
                              <Input
                                type="number"
                                min={selectedToken === "clawdtrust" ? predictionMarketMinStakeClt : predictionMarketMinStakeUsd}
                                max={selectedToken === "clawdtrust" ? undefined : predictionMarketMaxStakeUsd}
                                step={selectedToken === "clawdtrust" ? "1" : "0.01"}
                                value={amountValue}
                                onChange={(event) => handleAmountChange(market.id, event.target.value)}
                                placeholder={selectedToken === "clawdtrust" ? `Min. ${predictionMarketMinStakeClt.toLocaleString("en-US")} ClawdTrust` : `Min. ${predictionMarketMinStakeUsd} – max. ${predictionMarketMaxStakeUsd}`}
                                className="min-w-0 flex-1 border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                              />
                            </div>

                            {chosenSelectionId && Number.isFinite(numericAmount) && numericAmount > 0 ? (
                              <div className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 dark:border-white/10 dark:bg-orange-500/10">
                                <p className="text-xs uppercase tracking-[0.1em] text-orange-700 dark:text-orange-300">Estimated net return</p>
                                <p className="text-base font-semibold text-orange-900 dark:text-orange-200">
                                  {(() => {
                                    const sel = optionSummaries.find((o) => o.id === chosenSelectionId);
                                    if (!sel) return "—";
                                    const net = Number((numericAmount * sel.oddsMultiplier * (1 - predictionMarketFeeRate / 100)).toFixed(2));
                                    return selectedToken === "clawdtrust" ? formatClawdTrust(net) : formatCurrency(net);
                                  })()}
                                </p>
                              </div>
                            ) : null}

                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                              <span>Reserve ({predictionMarketReserveFeeRate}%): <strong className="text-zinc-700 dark:text-zinc-300">{selectedToken === "clawdtrust" ? formatClawdTrust(reserveFee) : formatCurrency(reserveFee)}</strong></span>
                              <span className="text-zinc-300 dark:text-zinc-600">·</span>
                              <span>Debit: <strong className="text-zinc-700 dark:text-zinc-300">{totalCharge > 0 ? `${totalCharge.toFixed(2)} ${selectedToken === "clawdtrust" ? "ClawdTrust" : paymentTokenSymbol}` : `0.00 ${selectedToken === "clawdtrust" ? "ClawdTrust" : paymentTokenSymbol}`}</strong></span>
                              <span className="text-zinc-300 dark:text-zinc-600">·</span>
                              <span>Claim: <strong className="text-zinc-700 dark:text-zinc-300">{predictionMarketFeeRate}%</strong></span>
                            </div>

                            <Button
                              type="button"
                              className="h-11 w-full rounded-2xl bg-orange-500 text-white hover:bg-orange-400"
                              onClick={() => void handleConfirmPosition(market, index)}
                              disabled={isSigning}
                            >
                              {isSigning ? <LoaderCircle className="size-4 animate-spin" /> : <Signature className="size-4" />}
                              {isWalletConnected ? "Confirm position" : "Connect & confirm"}
                            </Button>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
        </div>
        )}

      </div>
    </div>
  );
}

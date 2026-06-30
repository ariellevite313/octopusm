import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowUpToLine, Check, ChevronDown, Clock3, Copy, Database, ExternalLink, Globe, Lock, LogOut, LayoutDashboard, Menu, Moon, Receipt, Rocket, Search, ShieldCheck, Sun, Wallet, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  readCachedCentralWalletRecord,
  readCentralWalletRecord,
  registerCentralWalletIdentity,
} from "@/components/octopus-market/octopus-central-registry";
import { OctopusBrand } from "@/components/octopus-market/octopus-brand";
import { OctopusRuntimeBoundary } from "@/components/octopus-market/octopus-runtime-boundary";
import {
  clawdTrustDiscountAddress,
  clawdTrustThresholdUsd,
  contactItems,
  featuredTools,
  heroStats,
  highlightItems,
  navigationItems,
  officialTokenAddress,
  predictionMarketCategories,
  predictionMarketQuestions,
  predictionMarketTreasuryAddress,
  pricingPlans,
  toolTabs,
  type OctopusTokenBoardItem,
  type ToolItem,
} from "@/components/octopus-market/octopus-market-data";
import { clearAdminControlHistory, trackConnectedWalletSession } from "@/components/octopus-market/octopus-admin";
import { migrateWalletMemory, runLocalStorageMigration } from "@/lib/localStorage-migration";
import {
  initPredictionStore,
  readAdminCreatedPredictionMarkets,
  readPredictionResolutions,
  subscribeToPredictionMarketStorage,
  type AdminCreatedPredictionMarket,
  type PredictionResolutionRecord,
} from "@/components/octopus-market/prediction-market-store";
import { getResolvedMarkets } from "@/services/supabase/prediction-service";
import { SectionHeading } from "@/components/octopus-market/section-heading";
import { ThemeToggle } from "@/components/octopus-market/theme-toggle";
import { useOctopusLocale } from "@/components/octopus-market/octopus-locale";
import {
  connectSolanaWallet,
  disconnectSolanaWallet,
  fetchSolanaWalletBalanceSnapshot,
  formatSolBalance,
  formatUsdcBalance,
  formatWalletAddress,
  getSolanaProvider,
  readCachedWalletSnapshot,
  restoreSolanaWalletConnection,
  type SolanaWalletBalanceSnapshot,
} from "@/components/octopus-market/solana-wallet";
import { registerReferral } from "@/services/supabase/octo-service";
import { useLegacyBrowser } from "@/hooks/use-legacy-browser";
import { useIsMobile } from "@/hooks/use-mobile";
import { useThemeMode } from "@/hooks/use-theme-mode";

function SafeImage({
  src,
  alt,
  className,
  style,
  loading = "lazy",
  fetchPriority = "auto",
}: {
  src?: string | null;
  alt: string;
  className?: string;
  style?: CSSProperties;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
}) {
  if (!src) {
    return null;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
    />
  );
}

function AgentAvatar({ className = "size-8 rounded-xl", initialsClassName = "text-orange-600" }: { className?: string; initialsClassName?: string }) {
  const cyrDogeProfileSrc =
    "https://studio-assets.supernova.io/files/ws/757243/9f6009d0241fda73d5e07a356ccc6c33825c2d1abb0e629d11579561e5f4e941.jpeg";

  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden border border-white/30 bg-white ${className}`}>
      <img
        src={cyrDogeProfileSrc}
        alt="Aido Agent profile"
        loading="eager"
        fetchPriority="high"
        decoding="async"
        referrerPolicy="no-referrer"
        draggable={false}
        className="h-full w-full object-cover"
        onError={(event) => {
          const target = event.currentTarget;
          target.style.display = "none";
          const nextSibling = target.nextElementSibling as HTMLSpanElement | null;
          if (nextSibling) {
            nextSibling.style.display = "flex";
          }
        }}
      />
      <span className={`hidden h-full w-full items-center justify-center bg-orange-100 font-semibold ${initialsClassName}`}>
        AA
      </span>
    </div>
  );
}

function renderPredictionPreviewHeadline(market: {
  title: string;
  visualType?: "vs" | "simple";
  singleName?: string;
  singleImageSrc?: string;
  leftCompetitorName?: string;
  leftCompetitorImageSrc?: string;
  rightCompetitorName?: string;
  rightCompetitorImageSrc?: string;
}) {
  if (market.visualType === "vs") {
    return (
      <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-zinc-950 dark:text-white">
        {market.leftCompetitorImageSrc ? (
          <SafeImage
            src={market.leftCompetitorImageSrc}
            alt={`${market.leftCompetitorName ?? "Left team"} logo`}
            className="size-5 shrink-0 rounded-full border border-white/60 object-cover"
          />
        ) : null}
        <span className="min-w-0 flex-1 line-clamp-2">{market.leftCompetitorName ?? "Team A"}</span>
        <span className="shrink-0 text-zinc-400 dark:text-zinc-500">vs</span>
        {market.rightCompetitorImageSrc ? (
          <SafeImage
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
        <SafeImage
          src={market.singleImageSrc}
          alt={`${market.singleName ?? market.title} logo`}
          className="size-5 shrink-0 rounded-full border border-white/60 object-cover"
        />
      ) : null}
      <span className="min-w-0 line-clamp-2">{market.singleName ?? market.title}</span>
    </div>
  );
}

const LazyAdminControlCenter = lazy(() =>
  import("@/components/octopus-market/admin-control-center").then((module) => ({
    default: module.AdminControlCenter,
  }))
);

const LazyAIToolSocialPanel = lazy(() =>
  import("@/components/octopus-market/ai-tool-social-panel").then((module) => ({
    default: module.AIToolSocialPanel,
  }))
);

const LazyCyrDogeChat = lazy(() =>
  import("@/components/octopus-market/cyrdoge-chat").then((module) => ({
    default: module.CyrDogeChat,
  }))
);

const LazyOctopusAIListingDialog = lazy(() =>
  import("@/components/octopus-market/octopus-ai-listing-dialog").then((module) => ({
    default: module.OctopusAIListingDialog,
  }))
);

const LazyCommunityAIMarket = lazy(() =>
  import("@/components/octopus-market/community-ai-market").then((module) => ({
    default: module.CommunityAIMarket,
  }))
);

const LazyOctopusOnboardingDialog = lazy(() =>
  import("@/components/octopus-market/octopus-onboarding-dialog").then((module) => ({
    default: module.OctopusOnboardingDialog,
  }))
);

const LazyUserDashboardSections = lazy(() =>
  import("@/components/octopus-market/user-dashboard-sections").then((module) => ({
    default: module.UserDashboardSections,
  }))
);

const LazyClawdTrustHolderPage = lazy(() =>
  import("@/components/octopus-market/clawdtrust-holder-page").then((module) => ({
    default: module.ClawdTrustHolderPage,
  }))
);

const LazyBinaryPredictionStudio = lazy(() =>
  import("@/components/octopus-market/binary-prediction-studio").then((module) => ({
    default: module.BinaryPredictionStudio,
  }))
);

const LazySolfairLaunchStudio = lazy(() =>
  import("@/components/octopus-market/solfair-launch-studio").then((module) => ({
    default: module.SolfairLaunchStudio,
  }))
);

const LazyAdminDatabasePanel = lazy(() =>
  import("@/components/octopus-market/admin-database-panel").then((module) => ({
    default: module.AdminDatabasePanel,
  }))
);

function InlineLazyFallback({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
      {label}
    </div>
  );
}

function readStoredLaunchedTokensForWallet(walletAddress: string | null): OctopusTokenBoardItem[] {
  if (!walletAddress || typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem("octopus-market-token-board-v3");

    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue) as OctopusTokenBoardItem[];
    return Array.isArray(parsedValue)
      ? parsedValue.filter((token) => token?.launchedByWallet === walletAddress)
      : [];
  } catch {
    return [];
  }
}

function readOrCreateOctopusGuestActorId() {
  if (typeof window === "undefined") {
    return "guest";
  }

  try {
    const existingValue = window.localStorage.getItem("octopus-market-guest-actor-id");

    if (existingValue) {
      return existingValue;
    }

    const nextValue = `guest-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem("octopus-market-guest-actor-id", nextValue);
    return nextValue;
  } catch {
    return "guest";
  }
}

const goldVerificationBadgeSrc =
  "https://studio-assets.supernova.io/files/ws/757243/2f25ed55d146075e38472bdc708603004b4959dee3f03f4e93ea9bfca247f038.png";
const blueVerificationBadgeSrc =
  "https://studio-assets.supernova.io/files/ws/757243/659fe936faed48e9b5996663334209a9fef847420609aa602ff6d1890cb9f370.png";

function InlineVerificationBadge({ tool }: { tool: ToolItem }) {
  if (tool.verificationTone === "gold") {
    return (
      <SafeImage
        src={goldVerificationBadgeSrc}
        alt={`${tool.name} gold verified`}
        className="size-5 shrink-0 object-contain"
      />
    );
  }

  return (
    <SafeImage
      src={blueVerificationBadgeSrc}
      alt={`${tool.name} verified`}
      className="size-5 shrink-0 object-contain"
    />
  );
}

function InlinePanel({
  open,
  onClose,
  side = "right",
  title,
  description,
  badge,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  title: string;
  description?: string;
  badge?: string;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm">
      {side === "left" ? (
        <div
          className={`flex h-full w-full max-w-[96vw] flex-col overflow-hidden border-r border-orange-200 bg-white text-zinc-950 shadow-2xl dark:border-white/10 dark:bg-zinc-950 dark:text-white sm:max-w-sm ${className ?? ""}`}
        >
          <div className="flex items-start justify-between gap-4 border-b border-orange-100 bg-white/90 px-5 py-5 backdrop-blur-sm dark:border-white/10 dark:bg-zinc-950/85">
            <div>
              <h2 className="text-left text-xl font-semibold text-zinc-950 dark:text-white">{title}</h2>
              {description ? (
                <p className="mt-1 text-left text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-2xl border-orange-200 bg-white text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
              onClick={onClose}
            >
              <X className="size-4" />
              Close
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      ) : null}

      <button type="button" className="flex-1 cursor-default" aria-label="Close panel overlay" onClick={onClose} />

      {side === "right" ? (
        <div
          className={`ml-auto flex h-full w-full max-w-[96vw] flex-col overflow-hidden border-l border-orange-200 bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_12%,#fff7ed_100%)] text-zinc-950 shadow-2xl dark:border-white/10 dark:bg-[linear-gradient(180deg,#09090b_0%,#18181b_18%,#09090b_100%)] dark:text-white lg:max-w-[1320px] ${className ?? ""}`}
        >
          <div className="flex items-start justify-between gap-4 border-b border-orange-100 bg-white/90 px-4 py-4 backdrop-blur-sm sm:px-6 sm:py-5 dark:border-white/10 dark:bg-zinc-950/85">
            <div>
              <h2 className="text-left text-xl font-semibold text-zinc-950 dark:text-white">{title}</h2>
              {description ? (
                <p className="mt-1 text-left text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              {badge ? (
                <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                  {badge}
                </Badge>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="shrink-0 rounded-2xl border-orange-200 bg-white text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
                onClick={onClose}
              >
                <X className="size-4" />
                Close
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

type UserPageRoute = "home" | "wallet-dashboard" | "octopus-market";

const marketSectionShortcuts = [
  { id: "sports", label: "Sports" },
  { id: "crypto", label: "Crypto" },
  { id: "politics", label: "Politics" },
  { id: "technology", label: "Technologie" },
  { id: "cinema", label: "Cinema" },
  { id: "gaming", label: "Gaming" },
  { id: "previous", label: "Previous Markets" },
] as const;


function resolveUserPageRoute(hashValue: string): UserPageRoute {
  switch (hashValue) {
    case "#wallet-dashboard":
      return "wallet-dashboard";
    case "#octopus-market":
      return "octopus-market";
    default:
      return "home";
  }
}

// ─── Event start helpers (home page) ─────────────────────────────────────────

function homeGetEventLiveStatus(eventStartAt: string | null | undefined): "live" | "upcoming" | "none" {
  if (!eventStartAt) return "none";
  return Date.now() >= new Date(eventStartAt).getTime() ? "live" : "upcoming";
}

function homeFormatEventStartLabel(eventStartAt: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(eventStartAt));
}

function homeFormatCountdown(eventStartAt: string): string {
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

function HomeLiveBadge({ eventStartAt }: { eventStartAt: string | null | undefined }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!eventStartAt) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [eventStartAt]);

  if (!eventStartAt) return null;

  const status = homeGetEventLiveStatus(eventStartAt);

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

  void tick;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600 dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-orange-300">
      ⏳ Starts in {homeFormatCountdown(eventStartAt)}
    </span>
  );
}

function HomeMarketCountdownText({ eventStartAt }: { eventStartAt: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  void tick;
  const text = homeFormatCountdown(eventStartAt);
  if (text === "LIVE") return null;
  return <>{text}</>;
}

export function OctopusMarketPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletUsername, setWalletUsername] = useState<string | null>(null);
  const [walletTwitterHandle, setWalletTwitterHandle] = useState<string | null>(null);
  const [walletAvatarSrc, setWalletAvatarSrc] = useState<string | null>(null);
  const [pendingUsername, setPendingUsername] = useState("");
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [isCheckingWalletIdentity, setIsCheckingWalletIdentity] = useState(false);
  const [walletSnapshot, setWalletSnapshot] = useState<SolanaWalletBalanceSnapshot | null>(null);
  const [isLoadingWalletBalance, setIsLoadingWalletBalance] = useState(false);
  const [walletBalanceError, setWalletBalanceError] = useState<string | null>(null);
  const walletBalanceRefreshIdRef = useRef(0);
  const walletRestoredRef = useRef(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserAccessOpen, setIsUserAccessOpen] = useState(false);
  const [isDatabaseOpen, setIsDatabaseOpen] = useState(false);
  const [isAdminCenterOpen, setIsAdminCenterOpen] = useState(false);
  const [isAidoOpen, setIsAidoOpen] = useState(false);
  const { locale, setLocale, tr } = useOctopusLocale();
  const { isDark, toggleTheme } = useThemeMode();
  const { isLegacyBrowser } = useLegacyBrowser();
  const isMobile = useIsMobile();
  const reduceVisualLoad = isLegacyBrowser;
  const isWalletConnected = Boolean(walletAddress);
  const isAdminWallet = walletAddress === predictionMarketTreasuryAddress;
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [clockDisplay, setClockDisplay] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  });
  const [activeUserPage, setActiveUserPage] = useState<UserPageRoute>(() =>
    typeof window === "undefined" ? "home" : resolveUserPageRoute(window.location.hash)
  );
  const [selectedPredictionCategoryId, setSelectedPredictionCategoryId] = useState<string>("sports");
  const [selectedPredictionMarketId, setSelectedPredictionMarketId] = useState<string | null>(null);
  const [adminCreatedMarkets, setAdminCreatedMarkets] = useState<AdminCreatedPredictionMarket[]>(() =>
    readAdminCreatedPredictionMarkets()
  );
  const adminCreatedMarketsStateRef = useRef(JSON.stringify(readAdminCreatedPredictionMarkets()));
  const [resolvedMarkets, setResolvedMarkets] = useState<AdminCreatedPredictionMarket[]>([]);
  const [isLoadingResolved, setIsLoadingResolved] = useState(false);

  // ── Admin : tous les marchés (résolus + actifs) pour la vue tableau ────────
  const [homeResolutions, setHomeResolutions] = useState<Record<string, PredictionResolutionRecord>>(
    () => readPredictionResolutions()
  );
  const [isPredictionMarketOpen, setIsPredictionMarketOpen] = useState(false);
  const [isLaunchStudioOpen, setIsLaunchStudioOpen] = useState(false);
  const [isExploreOpen, setIsExploreOpen] = useState(false);
  const [isListingPricingOpen, setIsListingPricingOpen] = useState(false);
  const [copiedFooterField, setCopiedFooterField] = useState<string | null>(null);
  const floatingCardsContainerRef = useRef<HTMLDivElement | null>(null);
  const floatingCardsDragPointerIdRef = useRef<number | null>(null);
  const floatingCardsDragStartRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const [floatingCardsPosition, setFloatingCardsPosition] = useState<{ x: number; y: number } | null>(null);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  // One-time localStorage cleanup (removes stale pre-Supabase keys)
  useEffect(() => {
    runLocalStorageMigration();
  }, []);

  // Migrate old localStorage agent memory → Supabase when wallet connects
  useEffect(() => {
    if (!walletAddress) return;
    void migrateWalletMemory(walletAddress);
  }, [walletAddress]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const resetVersionKey = "octopus-market-admin-history-reset-v1";

    if (window.localStorage.getItem(resetVersionKey) === "done") {
      return;
    }

    window.localStorage.setItem(resetVersionKey, "pending");
    void clearAdminControlHistory().finally(() => {
      window.localStorage.setItem(resetVersionKey, "done");
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const updateClock = () => {
      const d = new Date();
      setClockDisplay(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
      );
    };
    const clockTimer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncRouteFromHash = () => {
      setActiveUserPage(resolveUserPageRoute(window.location.hash));
      setIsPredictionMarketOpen(window.location.hash === "#prediction-market");
      setIsLaunchStudioOpen(
        window.location.hash === "#launch-token" || window.location.hash === "#list-my-ai"
      );
      setIsExploreOpen(window.location.hash === "#explore");
      setIsListingPricingOpen(window.location.hash === "#listing-price");
    };

    syncRouteFromHash();
    window.addEventListener("hashchange", syncRouteFromHash);

    return () => {
      window.removeEventListener("hashchange", syncRouteFromHash);
    };
  }, []);

  useEffect(() => {
    if (!walletAddress && activeUserPage === "wallet-dashboard") {
      window.location.hash = "";
      setActiveUserPage("home");
    }
  }, [walletAddress, activeUserPage]);

  useEffect(() => {
    return subscribeToPredictionMarketStorage(() => {
      const nextMarkets = readAdminCreatedPredictionMarkets();
      const nextSerializedMarkets = JSON.stringify(nextMarkets);

      if (adminCreatedMarketsStateRef.current !== nextSerializedMarkets) {
        adminCreatedMarketsStateRef.current = nextSerializedMarkets;
        setAdminCreatedMarkets(nextMarkets);
      }

      setHomeResolutions(readPredictionResolutions());
    });
  }, []);

  useEffect(() => {
    if (!isMobile || typeof window === "undefined") {
      setFloatingCardsPosition(null);
      return;
    }

    const syncFloatingCardsPosition = () => {
      const container = floatingCardsContainerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const nextX = Math.max(12, window.innerWidth - rect.width - 12);
      const nextY = Math.max(88, Math.min(window.innerHeight - rect.height - 12, 96));

      setFloatingCardsPosition((currentValue) => {
        if (!currentValue) {
          return { x: nextX, y: nextY };
        }

        const clampedX = Math.min(Math.max(12, currentValue.x), Math.max(12, window.innerWidth - rect.width - 12));
        const clampedY = Math.min(Math.max(12, currentValue.y), Math.max(12, window.innerHeight - rect.height - 12));

        if (clampedX === currentValue.x && clampedY === currentValue.y) {
          return currentValue;
        }

        return { x: clampedX, y: clampedY };
      });
    };

    syncFloatingCardsPosition();
    window.addEventListener("resize", syncFloatingCardsPosition);

    return () => {
      window.removeEventListener("resize", syncFloatingCardsPosition);
    };
  }, [isMobile]);

  const refreshWalletBalance = useCallback(async (address: string) => {
    const refreshId = walletBalanceRefreshIdRef.current + 1;
    walletBalanceRefreshIdRef.current = refreshId;

    // Afficher le cache immédiatement — le RPC rafraîchit en arrière-plan
    const cached = readCachedWalletSnapshot(address);
    if (cached) {
      setWalletSnapshot(cached);
    }

    setIsLoadingWalletBalance(true);
    setWalletBalanceError(null);

    try {
      const snapshot = await fetchSolanaWalletBalanceSnapshot(address);

      if (walletBalanceRefreshIdRef.current !== refreshId) {
        return snapshot;
      }

      setWalletSnapshot(snapshot);
      setWalletBalanceError(null);
      return snapshot;
    } catch (error) {
      if (walletBalanceRefreshIdRef.current === refreshId) {
        setWalletSnapshot((currentSnapshot) => (currentSnapshot?.address === address ? currentSnapshot : null));
        setWalletBalanceError(
          error instanceof Error
            ? error.message
            : "Live SOL and USDC wallet data is unavailable right now because the public Solana RPC network did not answer."
        );
      }

      return null;
    } finally {
      if (walletBalanceRefreshIdRef.current === refreshId) {
        setIsLoadingWalletBalance(false);
      }
    }
  }, []);

  const refreshWalletIdentity = useCallback(async (address: string | null) => {
    if (!address) {
      setWalletUsername(null);
      setWalletTwitterHandle(null);
      setWalletAvatarSrc(null);
      setPendingUsername("");
      setIsCheckingWalletIdentity(false);
      return;
    }

    setIsCheckingWalletIdentity(true);

    const cachedWalletRecord = readCachedCentralWalletRecord(address);
    const cachedUsername = cachedWalletRecord?.username?.trim() || null;

    if (cachedUsername) {
      setWalletUsername(cachedUsername);
      setWalletTwitterHandle(cachedWalletRecord?.twitterHandle?.trim() || null);
      setWalletAvatarSrc(cachedWalletRecord?.avatarSrc || null);
      setPendingUsername(cachedUsername);
    }

    try {
      const walletRecord = await readCentralWalletRecord(address);
      const nextUsername = walletRecord?.displayName?.trim() || walletRecord?.username?.trim() || null;
      setWalletUsername(nextUsername);
      setWalletTwitterHandle(walletRecord?.twitterHandle?.trim() || null);
      setWalletAvatarSrc(walletRecord?.avatarSrc || null);
      setPendingUsername((currentValue) => {
        if (nextUsername) {
          return nextUsername;
        }

        return currentValue;
      });
    } finally {
      setIsCheckingWalletIdentity(false);
    }
  }, []);

  useEffect(() => {
    // Guard against React StrictMode double-invocation and unexpected re-runs
    if (walletRestoredRef.current) return;
    walletRestoredRef.current = true;

    void (async () => {
      const restoredConnection = await restoreSolanaWalletConnection();

      if (!restoredConnection) {
        return;
      }

      setWalletAddress(restoredConnection.address);
      void refreshWalletIdentity(restoredConnection.address);
      void refreshWalletBalance(restoredConnection.address);
    })();
  }, [refreshWalletBalance, refreshWalletIdentity]);

  useEffect(() => {
    if (!walletAddress) {
      setWalletSnapshot(null);
      setWalletBalanceError(null);
      return;
    }

    const cachedSnapshot = readCachedWalletSnapshot(walletAddress);

    if (cachedSnapshot) {
      setWalletSnapshot(cachedSnapshot);
    }

    void refreshWalletBalance(walletAddress);

    const timer = window.setInterval(() => {
      void refreshWalletBalance(walletAddress);
    }, 60000);

    return () => {
      window.clearInterval(timer);
    };
  }, [walletAddress, refreshWalletBalance]);

  useEffect(() => {
    void refreshWalletIdentity(walletAddress);
  }, [refreshWalletIdentity, walletAddress]);

  const resetWalletUiState = useCallback(() => {
    setWalletAddress(null);
    setWalletUsername(null);
    setWalletTwitterHandle(null);
    setWalletAvatarSrc(null);
    setPendingUsername("");
    setIsSavingUsername(false);
    setIsCheckingWalletIdentity(false);
    setWalletSnapshot(null);
    setWalletBalanceError(null);
    setIsLoadingWalletBalance(false);
    setIsConnectingWallet(false);
  }, []);

  const syncConnectedWallet = useCallback(
    (address: string, activityLabel: string) => {
      setWalletAddress(address);
      const cachedSnapshot = readCachedWalletSnapshot(address);

      if (cachedSnapshot) {
        setWalletSnapshot(cachedSnapshot);
        setWalletBalanceError(null);
      }

      void refreshWalletIdentity(address);
      void refreshWalletBalance(address);
      // Charge l'historique des paris pour ce wallet (prediction store)
      void initPredictionStore(address);
      // Referral: si un code est stocké en localStorage, on l'enregistre
      try {
        const storedRef = localStorage.getItem("octo_ref");
        if (storedRef?.startsWith("OCT-")) {
          void registerReferral(address, storedRef).then(() => {
            localStorage.removeItem("octo_ref");
          });
        }
      } catch {
        // localStorage unavailable — ignore
      }
      trackConnectedWalletSession(address, {
        isAdminWallet: address === predictionMarketTreasuryAddress,
        activityLabel,
      });
      return address;
    },
    [refreshWalletBalance, refreshWalletIdentity]
  );
  useEffect(() => {
    const provider = getSolanaProvider();

    if (!provider?.on) {
      return;
    }

    const handleConnect = (publicKey?: { toString(): string } | null) => {
      const nextAddress = publicKey?.toString() ?? provider.publicKey?.toString() ?? null;

      if (!nextAddress) {
        return;
      }

      syncConnectedWallet(
        nextAddress,
        nextAddress === predictionMarketTreasuryAddress
          ? "Admin wallet connected from provider event"
          : "User wallet connected from provider event"
      );
    };

    const handleAccountChanged = (publicKey?: { toString(): string } | null) => {
      const nextAddress = publicKey?.toString() ?? null;

      if (nextAddress) {
        syncConnectedWallet(
          nextAddress,
          nextAddress === predictionMarketTreasuryAddress
            ? "Admin wallet switched account on Octopus Market"
            : "User wallet switched account on Octopus Market"
        );
        return;
      }

      resetWalletUiState();
    };

    provider.on("connect", handleConnect);
    provider.on("accountChanged", handleAccountChanged);

    return () => {
      provider.removeListener?.("connect", handleConnect);
      provider.removeListener?.("accountChanged", handleAccountChanged);
    };
  }, [resetWalletUiState, syncConnectedWallet]);

  useEffect(() => {
    const provider = getSolanaProvider();

    if (!provider?.on) {
      return;
    }

    const handleDisconnect = () => {
      resetWalletUiState();
    };

    provider.on("disconnect", handleDisconnect);

    return () => {
      provider.removeListener?.("disconnect", handleDisconnect);
    };
  }, [resetWalletUiState]);

  const handleConnectWallet = async () => {
    if (isConnectingWallet) {
      return walletAddress;
    }

    if (walletAddress) {
      return walletAddress;
    }

    try {
      setIsConnectingWallet(true);
      const connection = await connectSolanaWallet();
      return syncConnectedWallet(
        connection.address,
        connection.address === predictionMarketTreasuryAddress
          ? "Admin wallet connected from top navigation"
          : "User wallet connected from top navigation"
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "wallet-unavailable") {
        toast.error("Phantom not found", {
          description: "Install the Phantom extension to connect.",
        });
      } else if (msg === "connection-timeout") {
        toast.error("Connection timed out", {
          description: "The connection took too long. Please try again.",
        });
      } else if (msg.includes("User rejected") || msg.includes("rejected")) {
        toast.error("Connection cancelled", {
          description: "You rejected the connection in Phantom.",
        });
      } else {
        toast.error("Connection failed", {
          description: msg || "An unexpected error occurred.",
        });
      }
      return null;
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const handleRegisterWalletIdentity = async () => {
    if (!walletAddress || isSavingUsername) {
      return;
    }

    const normalizedUsername = pendingUsername.trim();

    if (normalizedUsername.length < 2) {
      return;
    }

    setWalletUsername(normalizedUsername);
    setPendingUsername(normalizedUsername);

    try {
      setIsSavingUsername(true);
      const nextRecord = await registerCentralWalletIdentity(
        walletAddress,
        normalizedUsername,
        walletAddress === predictionMarketTreasuryAddress ? "admin" : "user"
      );
      const nextUsername = nextRecord?.username?.trim() || normalizedUsername;
      setWalletUsername(nextUsername);
      setPendingUsername(nextUsername);
      toast.success("Name saved", { description: `Your identity "${nextUsername}" has been registered.` });
    } catch (error) {
      setWalletUsername(null);
      setPendingUsername(normalizedUsername);

      if (error instanceof Error && error.message === "username-taken") {
        toast.error("Name already taken", { description: "This name is already reserved by another wallet." });
      } else if (error instanceof Error && error.message === "username-locked") {
        toast.error("Name locked", { description: "This wallet already has a permanent name that cannot be changed." });
      } else {
        toast.error("Registration failed", { description: "The name could not be registered. Please try again." });
      }
    } finally {
      setIsSavingUsername(false);
    }
  };

  const handleDisconnectWallet = async () => {
    try {
      await disconnectSolanaWallet();
    } finally {
      resetWalletUiState();
    }
  };

  const getFilteredTools = (category: string) =>
    featuredTools.filter((tool) => {
      const matchesCategory = category === "all" || tool.category === category;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        tool.name.toLowerCase().includes(normalizedSearch) ||
        tool.description.toLowerCase().includes(normalizedSearch) ||
        tool.badge.toLowerCase().includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });

  const totalVisibleTools = useMemo(() => getFilteredTools("all").length, [normalizedSearch]);
  const openPredictionMarket = useCallback(() => {
    if (typeof window !== "undefined" && window.location.hash !== "#prediction-market") {
      window.history.replaceState(null, "", "#prediction-market");
    }

    setIsPredictionMarketOpen(true);
  }, []);

  const openPredictionMarketSection = useCallback(
    (categoryId: string, marketId?: string) => {
      setSelectedPredictionCategoryId(categoryId);
      setSelectedPredictionMarketId(marketId ?? null);
      openPredictionMarket();
    },
    [openPredictionMarket]
  );

  const focusPredictionCategoryOnPage = useCallback((categoryId: string) => {
    setSelectedPredictionCategoryId(categoryId);
    setSelectedPredictionMarketId(null);

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "#open-prediction-markets");
      window.requestAnimationFrame(() => {
        window.document.getElementById("open-prediction-markets")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }, []);

  const openListingStudio = useCallback(() => {
    if (typeof window !== "undefined" && window.location.hash !== "#list-my-ai") {
      window.history.replaceState(null, "", "#list-my-ai");
    }

    setIsLaunchStudioOpen(true);
  }, []);

  const openLaunchStudio = useCallback(() => {
    if (typeof window !== "undefined" && window.location.hash !== "#launch-token") {
      window.history.replaceState(null, "", "#launch-token");
    }

    setIsLaunchStudioOpen(true);
  }, []);

  const openExploreWindow = useCallback(() => {
    if (typeof window !== "undefined" && window.location.hash !== "#explore") {
      window.history.replaceState(null, "", "#explore");
    }

    setIsExploreOpen(true);
  }, []);

  const openListingPricingWindow = useCallback(() => {
    if (typeof window !== "undefined" && window.location.hash !== "#listing-price") {
      window.history.replaceState(null, "", "#listing-price");
    }

    setIsListingPricingOpen(true);
  }, []);

  const closePredictionMarket = useCallback((nextOpen: boolean) => {
    setIsPredictionMarketOpen(nextOpen);

    if (!nextOpen && typeof window !== "undefined" && window.location.hash === "#prediction-market") {
      setSelectedPredictionMarketId(null);
      window.history.replaceState(null, "", "#hero");
    }
  }, []);

  const closeLaunchStudio = useCallback((nextOpen: boolean) => {
    setIsLaunchStudioOpen(nextOpen);

    if (
      !nextOpen &&
      typeof window !== "undefined" &&
      (window.location.hash === "#launch-token" || window.location.hash === "#list-my-ai")
    ) {
      window.history.replaceState(null, "", "#hero");
    }
  }, []);

  const closeExploreWindow = useCallback((nextOpen: boolean) => {
    setIsExploreOpen(nextOpen);

    if (!nextOpen && typeof window !== "undefined" && window.location.hash === "#explore") {
      window.history.replaceState(null, "", "#hero");
    }
  }, []);

  const closeListingPricingWindow = useCallback((nextOpen: boolean) => {
    setIsListingPricingOpen(nextOpen);

    if (!nextOpen && typeof window !== "undefined" && window.location.hash === "#listing-price") {
      window.history.replaceState(null, "", "#hero");
    }
  }, []);

  const formattedCurrentTime = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(currentTime)),
    [currentTime]
  );
  const walletBalance = walletSnapshot?.balanceSol ?? null;
  const walletUsdcBalance = walletSnapshot?.usdcBalance ?? null;
  const walletCltBalance = walletSnapshot?.clawdtrustBalance ?? null;
  const walletZeroBalanceSuffix = useMemo(() => {
    if (typeof walletBalance !== "number" || Number.isNaN(walletBalance) || walletBalance > 0) {
      return "";
    }

    return " · 0 SOL";
  }, [walletBalance]);
  const isFirstLoadBalance = isLoadingWalletBalance && typeof walletBalance !== "number";
  const isRefreshingBalance = isLoadingWalletBalance && typeof walletBalance === "number";
  const walletHeaderLabel = useMemo(() => {
    if (!walletAddress) {
      return "Connect wallet";
    }

    return `Wallet ${formatWalletAddress(walletAddress)}${walletZeroBalanceSuffix}`;
  }, [walletAddress, walletZeroBalanceSuffix]);
  const floatingWalletBalanceLabel = useMemo(() => {
    if (!walletAddress) {
      return "Connect wallet";
    }

    if (typeof walletBalance === "number") {
      return formatSolBalance(walletBalance);
    }

    if (isLoadingWalletBalance && typeof walletBalance !== "number") {
      return "Loading...";
    }

    if (walletBalanceError) {
      return "Syncing...";
    }

    return "Loading...";
  }, [isLoadingWalletBalance, walletAddress, walletBalance, walletBalanceError]);
  const floatingWalletUsdcBalanceLabel = useMemo(() => {
    if (!walletAddress) {
      return "Connect wallet";
    }

    if (typeof walletUsdcBalance === "number") {
      return formatUsdcBalance(walletUsdcBalance);
    }

    if (isLoadingWalletBalance && typeof walletUsdcBalance !== "number") {
      return "Loading...";
    }

    if (walletBalanceError) {
      return "Syncing...";
    }

    return "Loading...";
  }, [isLoadingWalletBalance, walletAddress, walletUsdcBalance, walletBalanceError]);

  const floatingWalletCltBalanceLabel = useMemo(() => {
    if (!walletAddress) return "—";
    if (typeof walletCltBalance === "number") return `${walletCltBalance.toLocaleString("en-US", { maximumFractionDigits: 2 })} ClawdTrust`;
    if (isLoadingWalletBalance) return "...";
    if (walletBalanceError) return "~";
    return "...";
  }, [isLoadingWalletBalance, walletAddress, walletCltBalance, walletBalanceError]);

  const launchedTokens = useMemo(
    () => readStoredLaunchedTokensForWallet(walletAddress),
    [walletAddress]
  );
  const socialActorKey = useMemo(
    () => walletAddress || walletUsername || readOrCreateOctopusGuestActorId(),
    [walletAddress, walletUsername]
  );
  const socialActorLabel = useMemo(
    () => walletUsername || walletTwitterHandle || formatWalletAddress(walletAddress) || "Guest",
    [walletAddress, walletTwitterHandle, walletUsername]
  );

  // Charger les marchés résolus à la demande
  useEffect(() => {
    if (selectedPredictionCategoryId !== "previous") return;
    if (resolvedMarkets.length > 0 || isLoadingResolved) return;
    setIsLoadingResolved(true);
    void getResolvedMarkets().then((rows) => {
      const mapped: AdminCreatedPredictionMarket[] = rows.map((row) => ({
        id: row.id,
        categoryId: row.category_id,
        title: row.title,
        marketType: row.market_type as AdminCreatedPredictionMarket["marketType"],
        resolutionLabel: row.resolution_label,
        eventDateLabel: row.event_date_label ?? undefined,
        eventStartAt: row.event_start_at ?? null,
        visualType: row.visual_type as AdminCreatedPredictionMarket["visualType"],
        singleName: row.single_name ?? undefined,
        singleImageSrc: row.single_image_src ?? undefined,
        leftCompetitorName: row.left_competitor_name ?? undefined,
        leftCompetitorImageSrc: row.left_competitor_image_src ?? undefined,
        rightCompetitorName: row.right_competitor_name ?? undefined,
        rightCompetitorImageSrc: row.right_competitor_image_src ?? undefined,
        options: (row.options ?? []) as AdminCreatedPredictionMarket["options"],
        createdAt: new Date(row.created_at).getTime(),
        createdByWallet: row.created_by_wallet ?? "",
        isAdminCreated: true as const,
        isResolved: row.is_resolved,
        resolutionOutcomeId: row.resolution_outcome_id ?? undefined,
        resolvedAt: row.resolved_at ? new Date(row.resolved_at).getTime() : undefined,
      }));
      setResolvedMarkets(mapped);
      setIsLoadingResolved(false);
    });
  }, [selectedPredictionCategoryId]);

    const isDedicatedUserPage = activeUserPage !== "home";
  const activeUserPageTitle =
    activeUserPage === "wallet-dashboard"
      ? "Wallet Dashboard"
      : "Become a ClawdTrust Holder";
  const activeUserSections = (["wallet"] as const);
  const userNavigationItems = [
    { label: "Wallet Dashboard", route: "#wallet-dashboard", icon: Wallet },
  ] as const;

  const allPredictionMarkets = useMemo(
    () => [...predictionMarketQuestions, ...adminCreatedMarkets],
    [adminCreatedMarkets]
  );

  const selectedPredictionCategory = useMemo(
    () => predictionMarketCategories.find((category) => category.id === selectedPredictionCategoryId) ?? predictionMarketCategories[0],
    [selectedPredictionCategoryId]
  );

  const visiblePredictionMarkets = useMemo(() => {
    if (selectedPredictionCategoryId === "previous") return resolvedMarkets;
    const now = Date.now();
    return allPredictionMarkets
      .filter((market) => market.categoryId === selectedPredictionCategoryId && !market.isResolved && !homeResolutions[market.id])
      .sort((a, b) => {
        const aMs = a.eventStartAt ? new Date(a.eventStartAt).getTime() : null;
        const bMs = b.eventStartAt ? new Date(b.eventStartAt).getTime() : null;
        if (aMs === null && bMs === null) return 0;
        if (aMs === null) return 1;
        if (bMs === null) return -1;
        return Math.max(0, aMs - now) - Math.max(0, bMs - now);
      });
  }, [allPredictionMarkets, resolvedMarkets, selectedPredictionCategoryId, homeResolutions]);

  const headerNavigationItems = navigationItems.filter(
    (item) => !["#hero", "#prediction-market", "#launch-token", "#explore"].includes(item.href)
  );

  const userAccessButtonClassName =
    "flex h-9 w-full justify-start rounded-xl border-orange-200 bg-white px-3 py-2 text-left text-xs font-medium text-zinc-950 hover:bg-orange-50 sm:text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800";

  const handleOpenUserRoute = (route: string) => {
    setIsUserAccessOpen(false);

    if (typeof window !== "undefined") {
      window.location.hash = route;
    }
  };

  const handleCopyFooterValue = useCallback(async (field: string, value: string) => {
    if (!value) {
      return;
    }

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else if (typeof window !== "undefined") {
        const textArea = window.document.createElement("textarea");
        textArea.value = value;
        textArea.setAttribute("readonly", "true");
        textArea.style.position = "absolute";
        textArea.style.left = "-9999px";
        window.document.body.appendChild(textArea);
        textArea.select();
        window.document.execCommand("copy");
        window.document.body.removeChild(textArea);
      }

      setCopiedFooterField(field);
      window.setTimeout(() => {
        setCopiedFooterField((currentValue) => (currentValue === field ? null : currentValue));
      }, 1800);
    } catch {
      return;
    }
  }, []);

  const handleFloatingCardsPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isMobile || typeof window === "undefined") {
        return;
      }

      const container = floatingCardsContainerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const startX = floatingCardsPosition?.x ?? rect.left;
      const startY = floatingCardsPosition?.y ?? rect.top;

      floatingCardsDragPointerIdRef.current = event.pointerId;
      floatingCardsDragStartRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        x: startX,
        y: startY,
      };

      container.setPointerCapture?.(event.pointerId);
    },
    [floatingCardsPosition, isMobile]
  );

  const handleFloatingCardsPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isMobile || typeof window === "undefined") {
        return;
      }

      if (floatingCardsDragPointerIdRef.current !== event.pointerId) {
        return;
      }

      const dragState = floatingCardsDragStartRef.current;
      const container = floatingCardsContainerRef.current;

      if (!dragState || !container) {
        return;
      }

      const deltaX = event.clientX - dragState.pointerX;
      const deltaY = event.clientY - dragState.pointerY;
      const maxX = Math.max(12, window.innerWidth - container.offsetWidth - 12);
      const maxY = Math.max(12, window.innerHeight - container.offsetHeight - 12);

      setFloatingCardsPosition({
        x: Math.min(Math.max(12, dragState.x + deltaX), maxX),
        y: Math.min(Math.max(12, dragState.y + deltaY), maxY),
      });
    },
    [isMobile]
  );

  const handleFloatingCardsPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const container = floatingCardsContainerRef.current;

    if (floatingCardsDragPointerIdRef.current === event.pointerId) {
      container?.releasePointerCapture?.(event.pointerId);
      floatingCardsDragPointerIdRef.current = null;
      floatingCardsDragStartRef.current = null;
    }
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-white text-zinc-950 dark:bg-black dark:text-white">
      <style>{`
        @keyframes aido-float {
          0%, 100% { transform: translateY(0px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1); }
          25% { transform: translateY(-8px) rotateX(8deg) rotateY(-6deg) rotateZ(-1.5deg) scale(1.01); }
          50% { transform: translateY(-14px) rotateX(0deg) rotateY(7deg) rotateZ(1.5deg) scale(1.02); }
          75% { transform: translateY(-6px) rotateX(-7deg) rotateY(-5deg) rotateZ(-1deg) scale(1.01); }
        }

        @keyframes aido-glow {
          0%, 100% { box-shadow: 0 18px 40px rgba(249, 115, 22, 0.28), 0 0 0 1px rgba(251, 146, 60, 0.18); }
          50% { box-shadow: 0 28px 58px rgba(249, 115, 22, 0.42), 0 0 0 1px rgba(251, 146, 60, 0.34); }
        }

        @keyframes aido-orbit {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.75; }
          50% { transform: translate3d(-4px, -10px, 0) scale(1.08); opacity: 1; }
        }

        @keyframes om-floating-card-drift {
          0%, 100% {
            transform: translateY(0px) rotateX(0deg) rotateY(-10deg) scale(1);
            box-shadow: 0 18px 44px rgba(249,115,22,0.14);
          }
          25% {
            transform: translateY(-7px) rotateX(5deg) rotateY(-4deg) scale(1.01);
            box-shadow: 0 24px 48px rgba(249,115,22,0.18);
          }
          50% {
            transform: translateY(-12px) rotateX(8deg) rotateY(1deg) scale(1.02);
            box-shadow: 0 28px 56px rgba(249,115,22,0.22);
          }
          75% {
            transform: translateY(-6px) rotateX(4deg) rotateY(-6deg) scale(1.01);
            box-shadow: 0 22px 46px rgba(249,115,22,0.18);
          }
        }

        @keyframes om-floating-card-glow {
          0%, 100% { filter: drop-shadow(0 0 0 rgba(251,146,60,0)); }
          50% { filter: drop-shadow(0 0 16px rgba(251,146,60,0.22)); }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[36rem] bg-zinc-100 dark:bg-black" />
      <header
        className={`top-0 z-40 border-b border-orange-100 dark:border-white/10 ${
          reduceVisualLoad ? "sticky bg-zinc-100 dark:bg-black" : "sticky bg-zinc-100 backdrop-blur-xl dark:bg-black"
        }`}
      >
        <div className="mx-auto flex w-full max-w-[112rem] items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6 sm:py-4 lg:gap-4 lg:px-8 2xl:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0 rounded-2xl border-orange-200 bg-white text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
              aria-label="Open navigation"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
            {isDedicatedUserPage && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 rounded-2xl border-orange-200 bg-white text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
                aria-label="Back to home"
                onClick={() => { window.location.hash = ""; setActiveUserPage("home"); }}
              >
                <ArrowLeft className="size-5" />
              </Button>
            )}
            <OctopusBrand compact />
          </div>

          <nav className="hidden min-w-0 flex-1 justify-center lg:flex">
            <div className="flex w-full max-w-[76rem] items-center justify-center gap-2 overflow-x-auto rounded-[1.75rem] border border-orange-100 bg-orange-50/80 p-2 shadow-[0_16px_40px_rgba(249,115,22,0.12)] md:[transform:perspective(1600px)_rotateX(6deg)] dark:border-white/10 dark:bg-white/5 dark:shadow-[0_22px_55px_rgba(0,0,0,0.3)]">
              {headerNavigationItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-transparent px-3 text-center text-[11px] font-medium leading-none text-zinc-700 transition hover:border-orange-200 hover:bg-white hover:text-orange-500 lg:text-sm dark:text-zinc-300 dark:hover:border-white/10 dark:hover:bg-zinc-900 dark:hover:text-orange-300"
                >
                  {item.label}
                </a>
              ))}
              {marketSectionShortcuts.map((item, idx) => {
                const isActiveShortcut = item.id === selectedPredictionCategoryId;

                return (
                  <>
                    {item.id === "previous" ? (
                      <span className="mx-1 h-5 w-px shrink-0 bg-orange-200 dark:bg-white/10" aria-hidden="true" />
                    ) : null}
                    <Button
                      key={item.id}
                      type="button"
                      variant="ghost"
                      className={
                      isActiveShortcut
                        ? "inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-orange-400 bg-orange-500 px-3 text-center text-[11px] font-semibold leading-none text-white shadow-sm transition hover:bg-orange-400 lg:text-sm"
                        : "inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-transparent px-3 text-center text-[11px] font-medium leading-none text-zinc-700 transition hover:border-orange-200 hover:bg-white hover:text-orange-500 lg:text-sm dark:text-zinc-300 dark:hover:border-white/10 dark:hover:bg-zinc-900 dark:hover:text-orange-300"
                    }
                    onClick={() => focusPredictionCategoryOnPage(item.id)}
                  >
                    {item.label}
                    </Button>
                  </>
                );
              })}
            </div>
          </nav>

          <div className="hidden shrink-0 items-center gap-3 lg:flex">
            {isLegacyBrowser ? (
              <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                Windows 7 compatibility mode
              </Badge>
            ) : null}
            {isWalletConnected ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-orange-200 bg-white text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
                  >
                    <Wallet className="size-4" />
                    {walletHeaderLabel}
                    <ChevronDown className="ml-1 size-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 border-zinc-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                >
                  <DropdownMenuLabel className="break-all whitespace-normal font-mono text-xs text-zinc-700 dark:text-zinc-400">
                    {walletAddress}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-zinc-100 dark:bg-white/10" />
                  <DropdownMenuItem
                    onClick={() => { window.location.hash = "#wallet-dashboard"; }}
                    className="cursor-pointer hover:bg-zinc-100 focus:bg-zinc-100 dark:hover:bg-white/10 dark:focus:bg-white/10"
                  >
                    <LayoutDashboard className="mr-2 size-4" />
                    Wallet Dashboard
                  </DropdownMenuItem>
                  {isAdminWallet && (
                    <>
                      <DropdownMenuSeparator className="bg-zinc-100 dark:bg-white/10" />
                      <DropdownMenuItem
                        onClick={() => setIsAdminCenterOpen(true)}
                        className="cursor-pointer hover:bg-zinc-100 focus:bg-zinc-100 dark:hover:bg-white/10 dark:focus:bg-white/10"
                      >
                        <ShieldCheck className="mr-2 size-4" /> Admin Center
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setIsDatabaseOpen(true)}
                        className="cursor-pointer hover:bg-zinc-100 focus:bg-zinc-100 dark:hover:bg-white/10 dark:focus:bg-white/10"
                      >
                        <Database className="mr-2 size-4" /> Data Base
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem
                    onClick={toggleTheme}
                    className="cursor-pointer hover:bg-zinc-100 focus:bg-zinc-100 dark:hover:bg-white/10 dark:focus:bg-white/10"
                  >
                    {isDark ? <Sun className="mr-2 size-4" /> : <Moon className="mr-2 size-4" />}
                    {isDark ? "Light mode" : "Dark mode"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-zinc-100 dark:bg-white/10" />
                  <DropdownMenuItem
                    onClick={() => void handleDisconnectWallet()}
                    className="cursor-pointer text-red-600 hover:bg-red-50 focus:bg-red-50 focus:text-red-600 dark:text-red-400 dark:hover:bg-red-500/10 dark:focus:bg-red-500/10 dark:focus:text-red-400"
                  >
                    <LogOut className="mr-2 size-4" />
                    Disconnect
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="border-orange-200 bg-white text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
                  onClick={() => void handleConnectWallet()}
                >
                  <Wallet className="size-4" />
                  {isConnectingWallet ? "Connecting..." : "Connect wallet"}
                </Button>
                <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
              </>
            )}
          </div>

          <Button className="lg:hidden" variant="ghost" size="icon" aria-label="Open account" onClick={() => setIsUserAccessOpen(true)}>
            <Wallet className="size-5" />
          </Button>
        </div>
      </header>

      {/* Drawer 1 — Navigation (☰ gauche) */}
      <InlinePanel
        open={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        side="left"
        title="Navigation"
        className="bg-zinc-100 dark:bg-zinc-950"
      >
        <div className="max-h-[calc(100vh-7rem)] overflow-y-auto px-4 py-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Catégories</p>
          <div className="space-y-2">
            {marketSectionShortcuts.map((item) => {
              const isActiveShortcut = item.id === selectedPredictionCategoryId;
              return (
                <Button
                  key={item.id}
                  type="button"
                  variant="outline"
                  className={
                    isActiveShortcut
                      ? "h-9 w-full justify-start rounded-xl border-orange-400 bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-400 sm:text-sm"
                      : "h-9 w-full justify-start rounded-xl border-orange-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:border-orange-300 hover:bg-orange-50 sm:text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/5"
                  }
                  onClick={() => { focusPredictionCategoryOnPage(item.id); setIsMobileMenuOpen(false); }}
                >
                  {item.label}
                </Button>
              );
            })}
          </div>

          <p className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">App</p>
          <div className="space-y-2">
            {headerNavigationItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block rounded-xl border border-orange-200 bg-white px-3 py-2.5 text-xs font-medium text-zinc-700 transition hover:border-orange-300 hover:bg-orange-50 sm:text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/5"
              >
                {item.label}
              </a>
            ))}
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full justify-start rounded-xl border-orange-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:border-orange-300 hover:bg-orange-50 sm:text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/5"
              onClick={() => { setIsMobileMenuOpen(false); openPredictionMarketSection("sports", null); }}
            >
              <Search className="mr-2 size-4" />
              Prediction Market
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full justify-start rounded-xl border-orange-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:border-orange-300 hover:bg-orange-50 sm:text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/5"
              onClick={() => { setIsMobileMenuOpen(false); handleOpenUserRoute("#octopus-market"); }}
            >
              <Globe className="mr-2 size-4" />
              Octopus Token
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled
              className="h-9 w-full cursor-not-allowed justify-start rounded-xl border-orange-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 opacity-60 sm:text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <Lock className="mr-2 size-4" />
              List My AI
              <Badge className="ml-auto border border-orange-200 bg-orange-50 px-2 py-0 text-[10px] text-orange-600 dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-orange-400">Soon</Badge>
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled
              className="h-9 w-full cursor-not-allowed justify-start rounded-xl border-orange-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 opacity-60 sm:text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <Lock className="mr-2 size-4" />
              Launch Token
              <Badge className="ml-auto border border-orange-200 bg-orange-50 px-2 py-0 text-[10px] text-orange-600 dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-orange-400">Soon</Badge>
            </Button>
          </div>

          <p className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Langue</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className={locale === "en"
                ? "h-9 rounded-xl border-orange-400 bg-orange-500 px-3 text-xs font-semibold text-white hover:bg-orange-400"
                : "h-9 rounded-xl border-orange-200 bg-white px-3 text-xs font-medium text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
              }
              onClick={() => setLocale("en")}
            >
              English
            </Button>
            <Button
              type="button"
              variant="outline"
              className={locale === "fr"
                ? "h-9 rounded-xl border-orange-400 bg-orange-500 px-3 text-xs font-semibold text-white hover:bg-orange-400"
                : "h-9 rounded-xl border-orange-200 bg-white px-3 text-xs font-medium text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
              }
              onClick={() => setLocale("fr")}
            >
              Français
            </Button>
          </div>
        </div>
      </InlinePanel>


      {/* Drawer 2 — Compte (👤 droite) */}
      <InlinePanel
        open={isUserAccessOpen}
        onClose={() => setIsUserAccessOpen(false)}
        side="left"
        title="My account"
        className="w-[18.5rem] max-w-[88vw] bg-zinc-100 p-0 dark:bg-zinc-950"
      >
        <div className="max-h-[calc(100vh-7rem)] overflow-y-auto px-4 py-4">
          <div className="space-y-2.5">
            {/* Wallet card */}
            {isWalletConnected ? (
              <div className="rounded-2xl border border-orange-200 bg-orange-50/80 px-3 py-3 dark:border-white/10 dark:bg-black/20">
                <p className="break-all font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{walletAddress}</p>
                <div className="mt-2.5 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 flex-1 rounded-xl border-orange-200 bg-white px-2 text-xs text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
                    onClick={toggleTheme}
                  >
                    {isDark ? <Sun className="mr-1.5 size-3.5" /> : <Moon className="mr-1.5 size-3.5" />}
                    {isDark ? "Light" : "Dark"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 flex-1 rounded-xl border-red-200 bg-white px-2 text-xs text-red-600 hover:bg-red-50 dark:border-red-500/20 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-500/10"
                    onClick={() => void handleDisconnectWallet()}
                  >
                    <LogOut className="mr-1.5 size-3.5" />
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className={userAccessButtonClassName}
                onClick={() => { setIsUserAccessOpen(false); void handleConnectWallet(); }}
              >
                <Wallet className="size-4" />
                Connect wallet
              </Button>
            )}

            {/* Wallet Dashboard */}
            {isWalletConnected && (
              <Button
                type="button"
                variant="outline"
                className={userAccessButtonClassName}
                onClick={() => handleOpenUserRoute("#wallet-dashboard")}
              >
                <LayoutDashboard className="size-4" />
                Wallet Dashboard
              </Button>
            )}

            {/* Admin */}
            {isAdminWallet && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className={userAccessButtonClassName}
                  onClick={() => { setIsUserAccessOpen(false); setIsAdminCenterOpen(true); }}
                >
                  <ShieldCheck className="size-4" />
                  Admin Control Center
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={userAccessButtonClassName}
                  onClick={() => { setIsUserAccessOpen(false); setIsDatabaseOpen(true); }}
                >
                  <Database className="size-4" />
                  Data Base
                </Button>
              </>
            )}
          </div>
        </div>
      </InlinePanel>

      <main className="relative z-10 [perspective:1800px]">
        <div className="mx-auto w-full max-w-[112rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 2xl:px-10">
          <div className="min-w-0 flex-1">
            {isDedicatedUserPage ? (
              <section className="py-4 sm:py-8">
                <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
                  <OctopusRuntimeBoundary fallbackTitle="User page recovered safely." fallbackDescription="This user page hit a browser-specific issue, so only this area was isolated while the rest of Octopus Market stays available.">
                    <Suspense fallback={<InlineLazyFallback label="Loading user page..." />}>
                      {activeUserPage === "octopus-market" ? (
                        <LazyClawdTrustHolderPage />
                      ) : (
                        <LazyUserDashboardSections
                          walletAddress={walletAddress}
                          walletRecord={readCachedCentralWalletRecord(walletAddress ?? "")}
                          launchedTokens={launchedTokens}
                          onConnectWallet={handleConnectWallet}
                          visibleSections={[...activeUserSections]}
                        />
                      )}
                    </Suspense>
                  </OctopusRuntimeBoundary>
                </div>
              </section>
            ) : (
              <>
                <section id="hero" className={`relative overflow-hidden scroll-mt-28${(highlightItems.length === 0 && heroStats.length === 0 && !isLegacyBrowser) ? " h-0 overflow-hidden" : ""}`}>
                  <div
                    className={
                      isLegacyBrowser
                        ? "absolute inset-0 bg-white dark:bg-black"
                        : "absolute inset-0 bg-white dark:bg-black"
                    }
                  />
                  <div className="relative mx-auto max-w-[92rem] px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
                    <div className="grid gap-5">
                      <div className="flex flex-col justify-center text-left lg:items-start">
                        {isLegacyBrowser ? (
                          <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-400">
                            Compatibility mode stays active for older Windows PCs, with reduced visual effects for a safer preview.
                          </p>
                        ) : null}

                        {highlightItems.length > 0 ? (
                          <div className="mt-6 grid w-full max-w-3xl gap-3 sm:grid-cols-3">
                            {highlightItems.map((item) => {
                              const Icon = item.icon;
                              return (
                                <div
                                  key={item.label}
                                  className="rounded-2xl border border-orange-200 bg-white px-4 py-4 text-sm text-zinc-700 shadow-[0_12px_35px_rgba(249,115,22,0.08)] transition-transform duration-300 hover:-translate-y-1 md:[transform:perspective(1600px)_rotateX(4deg)] dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:shadow-[0_16px_40px_rgba(0,0,0,0.22)]"
                                >
                                  <div className="flex items-center justify-center gap-2">
                                    <Icon className="size-4 text-orange-500 dark:text-orange-300" />
                                    <span>{item.label}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                      {heroStats.length > 0 ? (
                        <div>
                          <div className="grid gap-4 md:grid-cols-4">
                            {heroStats.map((stat) => (
                              <Card
                                key={stat.label}
                                className="border-orange-200 bg-white text-zinc-950 shadow-[0_14px_40px_rgba(249,115,22,0.08)] transition-transform duration-300 hover:-translate-y-1 md:[transform:perspective(1600px)_rotateX(4deg)] dark:border-white/10 dark:bg-white/5 dark:text-white dark:shadow-[0_18px_45px_rgba(0,0,0,0.22)]"
                              >
                                <CardHeader className="gap-3">
                                  <CardTitle className="text-3xl font-semibold text-orange-600 dark:text-orange-300">
                                    {stat.value}
                                  </CardTitle>
                                  <CardDescription className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                                    {stat.label}
                                  </CardDescription>
                                </CardHeader>
                              </Card>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section id="open-prediction-markets" className="-mt-2 scroll-mt-28 pb-8 pt-1 sm:-mt-4 lg:-mt-6">
                  <div className="mx-auto max-w-[92rem] px-4 sm:px-6 lg:px-8">
                      <div className={`${visiblePredictionMarkets.length >= 6 ? "grid gap-4 lg:grid-cols-3" : visiblePredictionMarkets.length >= 4 ? "grid gap-4 lg:grid-cols-2" : "space-y-4"}`}>
                        {isLoadingResolved && selectedPredictionCategoryId === "previous" ? (
                          <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-5 py-6 text-center text-sm text-zinc-500 dark:border-white/10 dark:bg-black/20 dark:text-zinc-400">
                            Loading previous markets…
                          </div>
                        ) : visiblePredictionMarkets.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/70 px-5 py-6 text-sm leading-7 text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-400">
                            {selectedPredictionCategoryId === "previous"
                              ? "No resolved markets yet."
                              : "No prediction market is open yet in this section. Select another section to see its live markets."}
                          </div>
                        ) : null}

                        {visiblePredictionMarkets.map((market) => {
                          const isPreviousView = selectedPredictionCategoryId === "previous";
                          const winningOptionId = market.resolutionOutcomeId ?? homeResolutions[market.id]?.outcomeId;
                          const resolvedTimestamp = market.resolvedAt ?? homeResolutions[market.id]?.resolvedAt;

                          if (isPreviousView) {
                            return (
                              <Card
                                key={market.id}
                                className="border border-zinc-200 bg-zinc-50 text-zinc-950 dark:border-white/5 dark:bg-zinc-900/50 dark:text-white"
                              >
                                <CardContent className="space-y-4 p-5">
                                  <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="space-y-2">
                                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600 dark:text-zinc-400">
                                        {market.title}
                                      </p>
                                      {renderPredictionPreviewHeadline(market)}
                                      <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-400">{market.resolutionLabel}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                      <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/10">
                                        ✓ Resolved
                                      </Badge>
                                      {resolvedTimestamp ? (
                                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                          {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(resolvedTimestamp))}
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>

                                  {market.options?.length ? (
                                    <div className={`grid gap-3 ${market.options.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
                                      {market.options.map((option) => {
                                        const isWinner = option.id === winningOptionId;
                                        return (
                                          <div
                                            key={option.id}
                                            className={isWinner
                                              ? "rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-4 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                                              : "rounded-2xl border border-zinc-200 bg-white px-4 py-4 opacity-50 dark:border-white/5 dark:bg-zinc-950/80"
                                            }
                                          >
                                            <div className="flex items-center justify-between gap-3">
                                              <div className="flex items-center gap-3">
                                                {option.logoSrc ? (
                                                  <SafeImage
                                                    src={option.logoSrc}
                                                    alt={`${option.label} logo`}
                                                    className="size-8 rounded-full border border-white/60 object-cover"
                                                  />
                                                ) : null}
                                                <div>
                                                  <p className={`text-sm font-semibold ${isWinner ? "text-emerald-800 dark:text-emerald-300" : "text-zinc-950 dark:text-white"}`}>
                                                    {option.label}
                                                  </p>
                                                  {option.description ? (
                                                    <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-400">{option.description}</p>
                                                  ) : null}
                                                </div>
                                              </div>
                                              {isWinner ? (
                                                <span className="text-lg">🏆</span>
                                              ) : (
                                                <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">x{option.oddsMultiplier}</span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </CardContent>
                              </Card>
                            );
                          }

                          const isMarketLive = homeGetEventLiveStatus(market.eventStartAt) === "live";
                          return (
                          <Card
                            key={market.id}
                            className="overflow-hidden border-orange-200 bg-orange-50/60 text-zinc-950 shadow-none dark:border-white/10 dark:bg-black/20 dark:text-white"
                          >
                            <CardContent className="space-y-4 p-5">
                              {/* Header + pill */}
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-300">
                                    {market.title}
                                  </p>
                                  <div className="mt-1.5">{renderPredictionPreviewHeadline(market)}</div>
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
                                    ⏳ <HomeMarketCountdownText eventStartAt={market.eventStartAt} />
                                  </span>
                                ) : null}
                              </div>

                              {/* Options */}
                              {market.options?.length ? (
                                <div className={`grid gap-2 ${market.options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                                  {market.options.map((option) => (
                                    <div
                                      key={option.id}
                                      className="flex flex-col gap-2 overflow-hidden rounded-2xl border border-orange-200 bg-white px-3 py-3 dark:border-white/10 dark:bg-zinc-950/80"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        {option.logoSrc ? (
                                          <SafeImage
                                            src={option.logoSrc}
                                            alt={`${option.label} logo`}
                                            className="size-5 shrink-0 rounded-full border border-white/60 object-cover"
                                          />
                                        ) : <span className="size-5 shrink-0" />}
                                        <span className="shrink-0 text-sm font-bold text-zinc-950 dark:text-white">×{option.oddsMultiplier}</span>
                                      </div>
                                      <span className="line-clamp-2 text-xs font-semibold leading-tight text-zinc-800 dark:text-zinc-100">{option.label}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}

                              {/* CTA */}
                              <div className="flex justify-end">
                                {isMarketLive ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                                    <span className="relative flex size-1.5">
                                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                      <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                                    </span>
                                    Event in progress
                                  </span>
                                ) : (
                                  <Button
                                    type="button"
                                    className="rounded-full bg-orange-500 text-white hover:bg-orange-400"
                                    onClick={() => openPredictionMarketSection(market.categoryId, market.id)}
                                  >
                                    Place a bet
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                          );
                        })}
                      </div>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </main>

      <footer id="footer" className="relative z-20 border-t border-orange-200 bg-zinc-100 py-12 shadow-[0_-18px_40px_rgba(249,115,22,0.08)] dark:border-white/10 dark:bg-zinc-900/95 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-[92rem] px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:gap-10 [transform-style:preserve-3d]">
            <div className="min-w-0 overflow-hidden rounded-[2rem] border border-orange-200 bg-white/96 p-5 shadow-[0_18px_45px_rgba(249,115,22,0.08)] backdrop-blur-md transition-transform duration-500 md:[transform:perspective(1800px)_rotateY(-2deg)_rotateX(3deg)] dark:border-white/10 dark:bg-zinc-900/92 dark:shadow-[0_18px_45px_rgba(0,0,0,0.28)] sm:p-7 lg:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="inline-flex max-w-full whitespace-normal border border-orange-200 bg-orange-100 px-3 py-1 text-left text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                  Ready to become an AI reference?
                </Badge>
                <Badge className="border border-zinc-200 bg-zinc-100 px-3 py-1 text-zinc-500 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/5">
                  <Lock className="mr-1 size-3" />
                  Coming Soon
                </Badge>
              </div>
              <h2 className="mt-5 break-words text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white sm:text-3xl lg:text-5xl">
                Launch your presence on Octopus Market now.
              </h2>
              <p className="mt-4 max-w-full text-sm leading-7 text-zinc-600 dark:text-zinc-400 sm:text-base lg:max-w-2xl lg:text-lg lg:leading-8">
                Launch Token, Prediction Market, AI listing, official platform references, and wallet validation all work together in one Octopus Market flow.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  disabled
                  className="h-11 w-full cursor-not-allowed rounded-2xl bg-orange-300 px-5 text-sm text-white opacity-60 sm:w-auto sm:px-8 sm:text-base"
                >
                  <Lock className="size-4" />
                  List my AI
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled
                  className="h-11 w-full cursor-not-allowed rounded-2xl border-orange-200 bg-white px-5 text-sm text-zinc-950 opacity-60 sm:w-auto sm:px-8 sm:text-base dark:border-white/15 dark:bg-transparent dark:text-white"
                >
                  Browse open markets
                </Button>
              </div>
            </div>

            <Card className="min-w-0 border-orange-200 bg-orange-50/95 text-zinc-950 shadow-[0_18px_45px_rgba(249,115,22,0.08)] backdrop-blur-md transition-transform duration-500 md:[transform:perspective(1800px)_rotateY(2deg)_rotateX(3deg)] dark:border-white/10 dark:bg-zinc-800/95 dark:text-white">
              <CardHeader>
                <CardTitle className="text-2xl">Key information</CardTitle>
                <CardDescription className="text-base text-zinc-600 dark:text-zinc-400">
                  Important platform references are accessible at a glance.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-3">
                  {contactItems.map((item, index) => {
                    const Icon = item.icon;
                    const isContractAddressItem = item.label.startsWith("CA ·");
                    const contractValue = isContractAddressItem ? officialTokenAddress : "";
                    return (
                      <div key={item.label}>
                        {item.href ? (
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noreferrer"
                            className="flex min-w-0 items-center gap-3 rounded-2xl border border-orange-200 bg-white px-4 py-3 transition hover:border-orange-300 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/20 dark:hover:bg-zinc-800"
                          >
                            <div className="flex size-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300">
                              <Icon className="size-4" />
                            </div>
                            <span className="min-w-0 text-sm text-zinc-700 dark:text-zinc-200">{item.label}</span>
                            <ExternalLink className="ml-auto size-4 text-zinc-400 dark:text-zinc-500" />
                          </a>
                        ) : (
                          <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-orange-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300">
                              <Icon className="size-4" />
                            </div>
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <span
                                className={isContractAddressItem
                                  ? "min-w-0 break-all text-xs leading-5 text-zinc-700 dark:text-zinc-200 sm:text-sm"
                                  : "min-w-0 text-sm text-zinc-700 dark:text-zinc-200"
                                }
                              >
                                {item.label}
                              </span>
                              {isContractAddressItem ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="ml-auto shrink-0 rounded-xl border-orange-200 bg-white px-3 text-zinc-700 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                  onClick={() => void handleCopyFooterValue("contract-address", contractValue)}
                                >
                                  {copiedFooterField === "contract-address" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                                  {copiedFooterField === "contract-address" ? "Copied" : "Copy"}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        )}
                        {index < contactItems.length - 1 ? (
                          <Separator className="my-3 bg-orange-100 dark:bg-white/5" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <Separator className="my-10 bg-orange-200 dark:bg-white/10" />

          <div className="flex flex-col gap-4 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between dark:text-zinc-300">
            <div className="flex items-center gap-3 text-zinc-700 dark:text-zinc-200">
              <Globe className="size-4" />
              <span>© 2026 Octopus Market · All rights reserved</span>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                to="/archive"
                className="text-zinc-600 hover:text-orange-600 hover:underline dark:text-zinc-400 dark:hover:text-orange-300"
              >
                Previous markets
              </Link>
              <span className="text-zinc-600 dark:text-zinc-300">
                Designed to showcase, launch, and grow premium AI products on the market.
              </span>
            </div>
          </div>
        </div>
      </footer>

      <Suspense fallback={null}>
        <LazyOctopusOnboardingDialog
          walletAddress={walletAddress}
          walletRecord={readCachedCentralWalletRecord(walletAddress ?? "")}
          onProfileSaved={(record) => {
            setWalletUsername(record.displayName || record.username || null);
            setWalletTwitterHandle(record.twitterHandle || null);
            setWalletAvatarSrc(record.avatarSrc || null);
          }}
        />
      </Suspense>

      <Button
        type="button"
        size="icon"
        className="fixed bottom-24 right-3 z-40 size-11 rounded-full border border-orange-300/70 bg-white/95 text-zinc-950 shadow-[0_18px_40px_rgba(249,115,22,0.22)] backdrop-blur-md hover:bg-white sm:bottom-28 sm:right-4 sm:size-12 dark:border-white/10 dark:bg-zinc-950/95 dark:text-white dark:hover:bg-zinc-900"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Back to top"
      >
        <ArrowUpToLine className="size-5" />
      </Button>

      <Button
        type="button"
        onClick={() => setIsAidoOpen(true)}
        className="fixed bottom-3 right-3 z-40 h-auto rounded-[1.5rem] border border-orange-300/70 bg-white/95 px-3 py-2.5 text-zinc-950 shadow-[0_20px_40px_rgba(249,115,22,0.16)] backdrop-blur-md hover:bg-white sm:bottom-4 sm:right-4 sm:rounded-[1.75rem] sm:px-4 sm:py-3 dark:border-orange-400/25 dark:bg-zinc-950/95 dark:text-white dark:hover:bg-zinc-900"
        style={
          reduceVisualLoad
            ? undefined
            : {
                animation: "aido-float 4.6s ease-in-out infinite, aido-glow 3.4s ease-in-out infinite",
                transformStyle: "preserve-3d",
              }
        }
      >
        <span className="pointer-events-none absolute inset-0 rounded-[1.75rem] bg-[linear-gradient(135deg,rgba(255,255,255,0.7),rgba(249,115,22,0.14))] dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(249,115,22,0.2))]" />
        <span
          className="pointer-events-none absolute -right-2 -top-2 size-4 rounded-full bg-orange-400 dark:bg-orange-300"
          style={reduceVisualLoad ? undefined : { animation: "aido-orbit 2.6s ease-in-out infinite" }}
        />
        <span className="relative flex items-center gap-3 [transform-style:preserve-3d]">
          <span className="flex size-11 items-center justify-center rounded-2xl border border-white/60 bg-white/80 shadow-[0_10px_25px_rgba(249,115,22,0.22)] [transform:translateZ(22px)] dark:border-white/10 dark:bg-zinc-900/90 dark:shadow-[0_12px_28px_rgba(0,0,0,0.3)]">
            <AgentAvatar className="size-8 rounded-xl border-orange-200 dark:border-white/10" initialsClassName="text-xs text-orange-600 dark:text-orange-300" />
          </span>
          <span className="flex flex-col items-start [transform:translateZ(16px)]">
            <span className="text-sm font-semibold leading-none">Aido Agent</span>
            <span className="mt-1 text-xs text-zinc-700 dark:text-zinc-400">Floating assistant</span>
          </span>
        </span>
      </Button>

      <InlinePanel
        open={isAidoOpen}
        onClose={() => setIsAidoOpen(false)}
        side="right"
        title="Aido Agent"
        description="The assistant is now available only from this floating entry point, with wallet-aware platform guidance inside Octopus Market."
        className="lg:max-w-[1260px]"
      >
        <div className="mb-4 flex items-center gap-3">
          <AgentAvatar className="size-11 rounded-2xl border-orange-200 dark:border-white/10" initialsClassName="text-orange-600 dark:text-orange-300" />
        </div>
        <Suspense fallback={<InlineLazyFallback label="Loading Aido Agent..." />}>
          <LazyCyrDogeChat
            isWalletConnected={isWalletConnected}
            walletAddress={walletAddress}
            onConnectWallet={handleConnectWallet}
          />
        </Suspense>
      </InlinePanel>

      <InlinePanel
        open={isDatabaseOpen}
        onClose={() => setIsDatabaseOpen(false)}
        side="right"
        title="Data Base"
        description="Shared Octopus Market registry access for the admin wallet only."
        badge="Admin only"
        className="lg:max-w-[1360px]"
      >
        <OctopusRuntimeBoundary fallbackTitle="Database view recovered safely." fallbackDescription="This admin database window hit a browser-specific issue, so only this area was isolated while the rest of Octopus Market stays available.">
          <Suspense fallback={<InlineLazyFallback label="Loading database..." />}>
            <LazyAdminDatabasePanel walletAddress={walletAddress} />
          </Suspense>
        </OctopusRuntimeBoundary>
      </InlinePanel>

      <InlinePanel
        open={isAdminCenterOpen}
        onClose={() => setIsAdminCenterOpen(false)}
        side="right"
        title="Admin Control Center"
        description="This admin area now opens only from the dedicated admin button above My Bets."
        badge="Admin only"
      >
        <OctopusRuntimeBoundary fallbackTitle="Admin center recovered safely." fallbackDescription="This admin window hit a browser-specific issue, so only the admin area was isolated while the rest of Octopus Market stays available.">
          <Suspense fallback={<InlineLazyFallback label="Loading admin center..." />}>
            <LazyAdminControlCenter walletAddress={walletAddress} />
          </Suspense>
        </OctopusRuntimeBoundary>
      </InlinePanel>

      {isPredictionMarketOpen ? (
        <div className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm">
          <div className="ml-auto flex h-full w-full max-w-[1320px] flex-col overflow-hidden border-l border-orange-200 bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_12%,#fff7ed_100%)] text-zinc-950 shadow-2xl dark:border-white/10 dark:bg-[linear-gradient(180deg,#09090b_0%,#18181b_18%,#09090b_100%)] dark:text-white">
            <div className="flex items-start justify-between gap-4 border-b border-orange-100 bg-white/90 px-4 py-4 backdrop-blur-sm sm:px-6 sm:py-5 dark:border-white/10 dark:bg-zinc-950/85">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-orange-600 dark:text-orange-300">Dedicated view</p>
                <h2 className="mt-2 text-left text-xl font-semibold text-zinc-950 dark:text-white">Prediction Market</h2>
              </div>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 rounded-2xl border-orange-200 bg-white text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
                onClick={() => closePredictionMarket(false)}
              >
                <X className="size-4" />
                Close
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
              <OctopusRuntimeBoundary fallbackTitle="Prediction market recovered safely." fallbackDescription="This window hit a browser-specific issue, so only the prediction market view was isolated while the rest of Octopus Market stays available.">
                <Suspense fallback={<InlineLazyFallback label="Loading prediction market..." />}>
                  <LazyBinaryPredictionStudio
                    isWalletConnected={isWalletConnected}
                    walletAddress={walletAddress}
                    walletUsername={walletUsername}
                    onConnectWallet={handleConnectWallet}
                    selectedCategoryId={selectedPredictionCategoryId}
                    selectedMarketId={selectedPredictionMarketId}
                  />
                </Suspense>
              </OctopusRuntimeBoundary>
            </div>
          </div>
        </div>
      ) : null}

      <InlinePanel
        open={isExploreOpen}
        onClose={() => closeExploreWindow(false)}
        side="right"
        title="Explore AI"
        description="Explore AI now opens only inside this dedicated window, separate from the main platform page."
        badge="Dedicated view"
      >
        <section className="space-y-10">
          <div className="rounded-3xl border border-orange-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950/70">
            <SectionHeading
              eyebrow="Explore"
              title="AI tools already listed on Octopus Market"
              description="A discovery experience designed to help users quickly compare the best tools on the market."
              align="left"
            />

            <div className="mt-10 flex flex-col gap-4 rounded-3xl border border-orange-200 bg-orange-50/70 p-5 lg:flex-row lg:items-center lg:justify-between dark:border-white/10 dark:bg-black/20">
              <div>
                <p className="text-lg font-semibold text-zinc-950 dark:text-white">Growing premium catalog</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {totalVisibleTools} tools visible in this demo, with launch-focused placement for ClawdTrust and the Agent category.
                </p>
              </div>
              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search a tool, benefit, or category"
                  className="h-11 border-orange-200 bg-white pl-10 text-zinc-950 placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500"
                />
              </div>
            </div>

            <Tabs defaultValue="all" className="mt-8 gap-6">
              <TabsList className="h-auto flex-wrap border border-orange-100 bg-white p-1 dark:border-white/10 dark:bg-white/5">
                {toolTabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} className="min-w-24">
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {toolTabs.map((tab) => {
                const visibleTools = getFilteredTools(tab.value);
                return (
                  <TabsContent key={tab.value} value={tab.value} className="space-y-5">
                    {visibleTools.length > 0 ? (
                      <div className="grid gap-5 lg:grid-cols-3">
                        {visibleTools.map((tool) => (
                          <Card
                            key={tool.name}
                            className="overflow-hidden border-orange-200 bg-white text-zinc-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white"
                          >
                            {tool.imageSrc ? (
                              <div className="h-44 overflow-hidden border-b border-orange-100 bg-slate-100 dark:border-white/10 dark:bg-slate-900">
                                <SafeImage src={tool.imageSrc} alt={tool.name} className="h-full w-full object-cover" />
                              </div>
                            ) : null}
                            <CardHeader>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <CardTitle className="flex items-center gap-2 text-xl">
                                    {tool.logoSrc ? (
                                      <SafeImage
                                        src={tool.logoSrc}
                                        alt={`${tool.name} logo`}
                                        className="size-6 rounded-md object-cover"
                                      />
                                    ) : null}
                                    <span>{tool.name}</span>
                                    <InlineVerificationBadge tool={tool} />
                                  </CardTitle>
                                  <CardDescription className="mt-2 text-sm text-orange-600 dark:text-orange-300">
                                    {tool.price}
                                  </CardDescription>
                                </div>
                                <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                                  {tool.badge}
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <p className="text-sm leading-7 text-zinc-600 dark:text-zinc-400">{tool.description}</p>
                              <div className="flex items-center justify-between rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-zinc-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                                <span>{tool.rating}</span>
                                <span>{tool.users}</span>
                              </div>
                              <Suspense fallback={<InlineLazyFallback label="Loading reactions..." />}>
                                <LazyAIToolSocialPanel
                                  toolName={tool.name}
                                  actorKey={socialActorKey}
                                  actorLabel={socialActorLabel}
                                />
                              </Suspense>
                              <Button asChild className="w-full rounded-xl bg-orange-500 text-white hover:bg-orange-400">
                                <a
                                  href={tool.url ?? "#"}
                                  target={tool.url ? "_blank" : undefined}
                                  rel={tool.url ? "noreferrer" : undefined}
                                >
                                  {tool.url ? "Open website" : "Discover"}
                                  {tool.url ? <ExternalLink className="size-4" /> : null}
                                </a>
                              </Button>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <Card className="border-dashed border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-white/5 dark:text-white">
                        <CardHeader>
                          <CardTitle>No results for this search</CardTitle>
                          <CardDescription className="text-zinc-600 dark:text-zinc-400">
                            Try another keyword or go back to the All tab.
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>

          <OctopusRuntimeBoundary fallbackTitle="Community AI recovered safely." fallbackDescription="The community AI listing block hit a browser-specific issue, so the rest of Explore AI stays visible.">
            <Suspense fallback={<InlineLazyFallback label="Loading community AI..." />}>
              <LazyCommunityAIMarket actorKey={socialActorKey} actorLabel={socialActorLabel} />
            </Suspense>
          </OctopusRuntimeBoundary>
        </section>
      </InlinePanel>

      <InlinePanel
        open={isListingPricingOpen}
        onClose={() => closeListingPricingWindow(false)}
        side="right"
        title="AI Listing Price"
        description="AI listing pricing now opens only inside this dedicated window, separate from the main platform page."
        badge="Dedicated view"
      >
        <section className="space-y-6">
          <SectionHeading
            eyebrow="Pricing"
            title="AI listing pricing"
            description="A clear model with USDC on Solana payment approval, automatic listing charge, and an instant advantage for $ClawdTrust holders."
            align="left"
          />

          <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
            <div className="grid gap-6 md:grid-cols-2">
              {pricingPlans.map((plan) => (
                <Card
                  key={plan.name}
                  className={`shadow-sm ${
                    plan.featured
                      ? "border-orange-300 bg-orange-100/70 text-zinc-950 dark:border-orange-400/40 dark:bg-orange-500/10 dark:text-white"
                      : "border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  }`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-2xl">{plan.name}</CardTitle>
                        <CardDescription className="mt-3 text-base text-zinc-600 dark:text-zinc-300">
                          {plan.description}
                        </CardDescription>
                      </div>
                      {plan.savings ? (
                        <Badge className="border border-orange-200 bg-white text-orange-700 hover:bg-white dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                          {plan.savings}
                        </Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end gap-1">
                      <span className="text-5xl font-semibold text-zinc-950 dark:text-white">{plan.price}</span>
                      <span className="pb-1 text-sm text-zinc-500 dark:text-zinc-400">{plan.billing}</span>
                    </div>
                    <ul className="mt-6 space-y-3 text-sm text-zinc-700 dark:text-zinc-200">
                      {plan.perks.map((perk) => (
                        <li key={perk} className="flex items-center gap-2">
                          <div className="size-2 rounded-full bg-orange-500 dark:bg-orange-300" />
                          <span>{perk}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-8">
                      <Suspense fallback={<InlineLazyFallback label="Loading listing flow..." />}>
                        <LazyOctopusAIListingDialog
                          walletAddress={walletAddress}
                          walletRecord={readCachedCentralWalletRecord(walletAddress ?? "")}
                          onConnectWallet={handleConnectWallet}
                          triggerLabel={plan.cta}
                        />
                      </Suspense>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-orange-200 bg-white text-zinc-950 shadow-sm dark:border-white/10 dark:bg-zinc-950/70 dark:text-white">
              <CardHeader>
                <Badge className="w-fit border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                  Holder benefit
                </Badge>
                <CardTitle className="text-2xl">-30% from {clawdTrustThresholdUsd}$ in $ClawdTrust</CardTitle>
                <CardDescription className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
                  The ClawdTrust ecosystem rewards holders with a direct discount on listing.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300">
                    <span>Wallet threshold</span>
                    <span>{clawdTrustThresholdUsd}$ required</span>
                  </div>
                  <Progress
                    value={100}
                    className="mt-3 h-2 bg-orange-100 dark:bg-white/10 [&_[data-slot=progress-indicator]]:bg-orange-500 dark:[&_[data-slot=progress-indicator]]:bg-orange-300"
                  />
                     <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    Use the holder address provided during your listing request to activate the benefit.
                  </p>
                </div>

                <div className="rounded-2xl border border-orange-200 bg-white p-4 dark:border-white/10 dark:bg-black/20">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">$ClawdTrust holder address</p>
                  <p className="mt-3 break-all text-xs leading-6 text-orange-600 dark:text-orange-300">
                    {clawdTrustDiscountAddress}
                  </p>
                </div>

                <Suspense fallback={<InlineLazyFallback label="Loading listing flow..." />}>
                  <LazyOctopusAIListingDialog
                    walletAddress={walletAddress}
                    walletRecord={readCachedCentralWalletRecord(walletAddress ?? "")}
                    onConnectWallet={handleConnectWallet}
                    triggerLabel="Activate my listing"
                  />
                </Suspense>
              </CardContent>
            </Card>
          </div>
        </section>
      </InlinePanel>

      <InlinePanel
        open={isLaunchStudioOpen}
        onClose={() => closeLaunchStudio(false)}
        side="right"
        title={typeof window !== "undefined" && window.location.hash === "#list-my-ai" ? "List My AI" : "Launch Token"}
        description={typeof window !== "undefined" && window.location.hash === "#list-my-ai"
          ? "The AI listing flow now opens only inside this dedicated window, separate from the main platform page."
          : "The launch token flow now opens only inside this dedicated window, separate from the main platform page."}
        badge="Dedicated view"
      >
        <OctopusRuntimeBoundary fallbackTitle="Launch studio recovered safely." fallbackDescription="This window hit a browser-specific issue, so only the launch token view was isolated while the rest of Octopus Market stays available.">
          <Suspense fallback={<InlineLazyFallback label="Loading launch studio..." />}>
            <LazySolfairLaunchStudio
              isWalletConnected={isWalletConnected}
              isLegacyBrowser={isLegacyBrowser}
              walletAddress={walletAddress}
              walletUsername={walletUsername}
              onConnectWallet={handleConnectWallet}
            />
          </Suspense>
        </OctopusRuntimeBoundary>
      </InlinePanel>
    </div>
  );
}

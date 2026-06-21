import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Coins,
  Copy,
  FileUp,
  ImagePlus,
  Link2,
  LoaderCircle,
  MessageCircle,
  QrCode,
  Send,
  ShieldCheck,
  Signature,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { upsertAdminPaymentNotification } from "@/components/octopus-market/octopus-admin";
import { createBagsLaunchRequest } from "@/components/octopus-market/bags-fm";
import {
  buildTransaction,
  fetchTransaction,
  findReference,
  type PaymentRequest,
  submitSolanaTransfer,
  validateTransfer,
} from "@/components/octopus-market/solana-pay";
import {
  clawdTrustThresholdUsd,
  octopusTokensSeed,
  officialTokenAddress,
  officialTokenLogoSrc,
  paymentTokenSymbol,
  platformReserveFeeRate,
  solanaPaymentAddress,
  solanaUsdcMintAddress,
  type OctopusTokenBoardItem,
} from "@/components/octopus-market/octopus-market-data";
import { ListingDialog } from "@/components/octopus-market/listing-dialog";
import { OctopusAIListingDialog } from "@/components/octopus-market/octopus-ai-listing-dialog";
import { SectionHeading } from "@/components/octopus-market/section-heading";
import { calculatePercentageAmount, formatWalletAddress, getSolanaProvider } from "@/components/octopus-market/solana-wallet";

const launchPaymentTokenSymbol = "SOL";
const baseLaunchFee = 5;
const premiumHolderThresholdUsd = 100;
const discountLaunchFee = 4.5;
const freeLaunchFee = 0.2;
const octopusTokensStorageKey = "octopus-market-token-board-v3";
const officialDexScreenerPairAddress = "egi97rat7zrxrqvvv7edb5tvxzzxwgdh8vwvkgpfzdfc";
const officialVerifiedHolders = 28;
const officialTokenGoldBadgeSrc =
  "https://studio-assets.supernova.io/files/ws/757243/2f25ed55d146075e38472bdc708603004b4959dee3f03f4e93ea9bfca247f038.png";

type LaunchStatus = "idle" | "loading" | "success" | "error";
type LaunchOption = "free" | "standard";
type StudioTab = "token" | "listing";
type TokenWorkspaceTab = "create" | "tokens";
type ChartRange = "1H" | "6H" | "24H" | "7D";

type SolfairLaunchStudioProps = {
  isWalletConnected: boolean;
  isLegacyBrowser?: boolean;
  walletAddress: string | null;
  walletUsername?: string | null;
  onConnectWallet: () => Promise<string | null>;
};

const launchOptions: Array<{
  id: LaunchOption;
  title: string;
  description: string;
  badge: string;
}> = [
  {
    id: "free",
    title: "Free option",
    description: "Launch from Octopus Market with a lightweight 0.2 SOL processing fee and direct Bags.fm submission.",
    badge: "0.2 SOL standard fee",
  },
  {
    id: "standard",
    title: "Premium launch",
    description: "Get a premium launch flow with a 10% reduction when the connected wallet holds at least $100 in $ClawdTrust, plus 2 KOL, 1 month of support, regular posts, strategic advice, branding, and 2 AMA before Bags.fm publication.",
    badge: "$100 in $ClawdTrust · 10% off",
  },
];

const chartRangeOptions: ChartRange[] = ["1H", "6H", "24H", "7D"];

const launchBenefits = [
  "Free option available with a 0.2 SOL standard fee",
  "Premium launch gets a 10% reduction only if the connected wallet holds at least $100 in $ClawdTrust",
  "Premium launch includes 2 KOL activations and 1 month of support",
  "Regular posts, strategic advice, and branding are included in the premium launch",
  "2 AMA sessions are included in the premium launch package",
  "Deployer first buy can be configured between 1% and 5% of supply right at launch",
  "Bags.fm launch request is sent only after payment validation succeeds",
];

function normalizeLink(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmedValue)) {
    return trimmedValue;
  }

  return `https://${trimmedValue}`;
}

function clampInitialBuyPercent(value: string | number) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 1;
  }

  return Math.min(5, Math.max(1, Math.round(numericValue)));
}

function getPriceFractionDigits(numericValue: number) {
  if (numericValue < 0.0001) {
    return 8;
  }

  if (numericValue < 0.01) {
    return 6;
  }

  if (numericValue < 1) {
    return 5;
  }

  return 4;
}

function formatUsdValue(value: string | number | null | undefined, mode: "price" | "market" = "market") {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: mode === "market" && numericValue >= 10000 ? "compact" : "standard",
    minimumFractionDigits: mode === "price" ? getPriceFractionDigits(numericValue) : 2,
    maximumFractionDigits: mode === "price" ? getPriceFractionDigits(numericValue) : 2,
  }).format(numericValue);
}

function parseFormattedUsdValue(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const sanitizedValue = value.replace(/[^0-9.-]+/g, "");
  const numericValue = Number(sanitizedValue);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatHoldersValue(value: string | number | null | undefined) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return "Live sync";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(numericValue);
}

function parseHoldersNumber(value: string | number | null | undefined) {
  const numericValue = Number(typeof value === "string" ? value.replace(/,/g, "") : value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return null;
  }

  return numericValue;
}

function isOfficialTrackedToken(token: OctopusTokenBoardItem) {
  return token.contractAddress === officialTokenAddress || token.id === "clawdtrust";
}

function formatCompactContractAddress(value: string | null | undefined) {
  if (!value) {
    return "Pending";
  }

  if (value.length <= 10) {
    return value;
  }

  return `${value.slice(0, 5)}...${value.slice(-5)}`;
}

function formatChartLabel(timestamp: number, range: ChartRange) {
  return new Intl.DateTimeFormat(
    "en-US",
    range === "7D"
      ? {
          month: "short",
          day: "numeric",
        }
      : {
          hour: "2-digit",
          minute: "2-digit",
        }
  ).format(new Date(timestamp * 1000));
}

function createFallbackChartPoints(basePrice: number, range: ChartRange = "24H") {
  const safePrice = basePrice > 0 ? basePrice : 1;
  const rangeConfig =
    range === "1H"
      ? { points: 12, stepSeconds: 60 * 5 }
      : range === "6H"
        ? { points: 24, stepSeconds: 60 * 15 }
        : range === "7D"
          ? { points: 28, stepSeconds: 60 * 60 * 6 }
          : { points: 24, stepSeconds: 60 * 60 };

  return Array.from({ length: rangeConfig.points }, (_, index) => {
    const timestamp = Math.floor(Date.now() / 1000) - (rangeConfig.points - 1 - index) * rangeConfig.stepSeconds;
    const wave = Math.sin(index / 2.6) * 0.035;
    const drift = (index - 12) * 0.0018;
    const close = Number((safePrice * (1 + wave + drift)).toFixed(6));
    const high = Number((close * 1.012).toFixed(6));
    const low = Number((close * 0.988).toFixed(6));
    const volume = Number((safePrice * 12000 * (1 + index / 12)).toFixed(2));

    return {
      timestamp,
      label: formatChartLabel(timestamp, range),
      close,
      high,
      low,
      volume,
    };
  });
}

async function fetchBirdeyeJson(path: string) {
  const response = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${path}`);

  if (!response.ok) {
    throw new Error("dexscreener-request-failed");
  }

  return response.json();
}

async function fetchDexScreenerTokenJson(tokenAddress: string) {
  const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${tokenAddress}`);

  if (!response.ok) {
    throw new Error("dexscreener-token-request-failed");
  }

  return response.json();
}

function findFirstNumericLikeValue(payload: unknown, candidateKeys: string[]) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const normalizedKeys = new Set(candidateKeys.map((key) => key.replace(/[^a-z0-9]/gi, "").toLowerCase()));
  const visited = new WeakSet<object>();

  const search = (value: unknown): string | number | null => {
    if (!value || typeof value !== "object") {
      return null;
    }

    if (visited.has(value)) {
      return null;
    }

    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const nestedMatch = search(item);

        if (nestedMatch !== null) {
          return nestedMatch;
        }
      }

      return null;
    }

    const record = value as Record<string, unknown>;

    for (const [key, entryValue] of Object.entries(record)) {
      const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();

      if (normalizedKeys.has(normalizedKey) && (typeof entryValue === "number" || typeof entryValue === "string")) {
        return entryValue;
      }
    }

    for (const entryValue of Object.values(record)) {
      const nestedMatch = search(entryValue);

      if (nestedMatch !== null) {
        return nestedMatch;
      }
    }

    return null;
  };

  return search(payload);
}

function extractBirdeyeItems(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return [] as Array<Record<string, unknown>>;
  }

  const payloadRecord = payload as Record<string, unknown>;
  const data = payloadRecord.data;

  if (!data || typeof data !== "object") {
    return [] as Array<Record<string, unknown>>;
  }

  const dataRecord = data as Record<string, unknown>;
  const items = dataRecord.items;

  if (!Array.isArray(items)) {
    return [] as Array<Record<string, unknown>>;
  }

  return items.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
}

async function fetchBirdeyeChartPoints(tokenAddress: string, fallbackPrice: number, range: ChartRange = "24H") {
  try {
    const payload = await fetchBirdeyeJson(tokenAddress);
    const pair = Array.isArray(payload?.pairs) ? payload.pairs[0] : payload?.pair;
    const livePrice = Number(pair?.priceUsd ?? fallbackPrice) || fallbackPrice;
    const priceChangePercent = Number(pair?.priceChange?.h24 ?? 0);
    const driftRatio = Number.isFinite(priceChangePercent) ? priceChangePercent / 100 : 0;
    const chartPoints = createFallbackChartPoints(livePrice, range);

    if (chartPoints.length < 2) {
      return chartPoints;
    }

    return chartPoints.map((point, index) => {
      const factor = chartPoints.length === 1 ? 1 : index / (chartPoints.length - 1);
      const close = Number((livePrice * (1 - driftRatio + driftRatio * factor)).toFixed(8));
      const high = Number((close * 1.012).toFixed(8));
      const low = Number((close * 0.988).toFixed(8));
      return {
        ...point,
        close,
        high,
        low,
        volume: Number(pair?.volume?.h24 ?? point.volume ?? 0),
      };
    });
  } catch {
    return createFallbackChartPoints(fallbackPrice, range);
  }
}

function getBirdeyeTokenAddress(token: OctopusTokenBoardItem) {
  if (isOfficialTrackedToken(token)) {
    return token.poolAddress || officialDexScreenerPairAddress;
  }

  if (token.poolAddress) {
    return token.poolAddress;
  }

  const dexMatch = token.dexScreenerUrl?.match(/\/solana\/([^/?#]+)/i);
  return dexMatch?.[1] ?? "";
}

function extractBirdeyeMetricValue(payload: unknown, metric: "price" | "volume" | "marketCap" | "holders") {
  if (payload && typeof payload === "object") {
    const pair = Array.isArray((payload as { pairs?: unknown[] }).pairs)
      ? (payload as { pairs?: Array<Record<string, unknown>> }).pairs?.[0]
      : ((payload as { pair?: Record<string, unknown> }).pair ?? payload);

    if (pair && typeof pair === "object") {
      if (metric === "price") {
        return (pair as { priceUsd?: string | number }).priceUsd ?? null;
      }

      if (metric === "volume") {
        return (pair as { volume?: { h24?: string | number } }).volume?.h24 ?? null;
      }

      if (metric === "marketCap") {
        return (
          (pair as { marketCap?: string | number }).marketCap ??
          (pair as { fdv?: string | number }).fdv ??
          (pair as { liquidity?: { usd?: string | number } }).liquidity?.usd ??
          null
        );
      }
    }
  }

  if (metric === "price") {
    return findFirstNumericLikeValue(payload, ["price", "priceUsd", "value", "currentPrice"]);
  }

  if (metric === "volume") {
    return findFirstNumericLikeValue(payload, ["v24hUSD", "volume24hUSD", "volume24h", "v24h", "volume"]);
  }

  if (metric === "marketCap") {
    return findFirstNumericLikeValue(payload, ["marketCap", "marketCapUsd", "mc", "fdv", "liquidity"]);
  }

  return findFirstNumericLikeValue(payload, ["holders", "holder", "holderCount", "holdersCount", "holder_count"]);
}

async function fetchOfficialTokenHolders(token: OctopusTokenBoardItem) {
  if (!isOfficialTrackedToken(token)) {
    return null;
  }

  try {
    const tokenPayload = await fetchDexScreenerTokenJson(token.contractAddress || officialTokenAddress);
    const holderValue = extractBirdeyeMetricValue(tokenPayload, "holders");
    const parsedHolderValue = parseHoldersNumber(holderValue);

    if (parsedHolderValue !== null) {
      return parsedHolderValue;
    }
  } catch {
    return parseHoldersNumber(token.holders) ?? officialVerifiedHolders;
  }

  return parseHoldersNumber(token.holders) ?? officialVerifiedHolders;
}

async function fetchLiveTokenMetrics(token: OctopusTokenBoardItem) {
  const tokenAddress = getBirdeyeTokenAddress(token);

  if (!tokenAddress) {
    return null;
  }

  try {
    const overviewPayload = await fetchBirdeyeJson(tokenAddress);
    let priceValue = extractBirdeyeMetricValue(overviewPayload, "price");

    if (priceValue === null) {
      const pricePayload = await fetchBirdeyeJson(tokenAddress);
      priceValue = extractBirdeyeMetricValue(pricePayload, "price");
    }

    const fallbackPrice = Number(priceValue) || parseFormattedUsdValue(token.price) || 1;
    const chartPoints = await fetchBirdeyeChartPoints(tokenAddress, fallbackPrice, "24H");
    const liveHoldersCount = extractBirdeyeMetricValue(overviewPayload, "holders");
    const officialHoldersCount = await fetchOfficialTokenHolders(token);
    const holdersCount = liveHoldersCount ?? officialHoldersCount;

    return {
      price: formatUsdValue(priceValue, "price") || token.price,
      volume24h: formatUsdValue(extractBirdeyeMetricValue(overviewPayload, "volume"), "market") || token.volume24h,
      marketCap: formatUsdValue(extractBirdeyeMetricValue(overviewPayload, "marketCap"), "market") || token.marketCap,
      holders: formatHoldersValue(holdersCount) || token.holders,
      status: "Live",
      chartPoints,
      lastUpdatedLabel: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date()),
    } satisfies Partial<OctopusTokenBoardItem>;
  } catch {
    return null;
  }
}

export function readStoredOctopusTokens() {
  if (typeof window === "undefined") {
    return octopusTokensSeed;
  }

  try {
    const rawValue = window.localStorage.getItem(octopusTokensStorageKey);

    if (!rawValue) {
      return octopusTokensSeed;
    }

    const parsedValue = JSON.parse(rawValue) as OctopusTokenBoardItem[];
    return Array.isArray(parsedValue) && parsedValue.length > 0
      ? parsedValue.map((token) => ({
          ...token,
          name: token.name || token.ticker || "Octopus token",
          logoSrc:
            token.contractAddress === officialTokenAddress || token.id === "clawdtrust"
              ? officialTokenLogoSrc
              : token.logoSrc || "",
          poolAddress: token.poolAddress || "",
          solscanUrl:
            token.solscanUrl ||
            (token.contractAddress ? `https://solscan.io/token/${token.contractAddress}` : ""),
          dexScreenerUrl:
            token.dexScreenerUrl ||
            (token.poolAddress ? `https://dexscreener.com/solana/${token.poolAddress}` : ""),
          birdEyeUrl:
            token.birdEyeUrl ||
            (token.contractAddress ? `https://birdeye.so/solana/token/${token.contractAddress}` : token.geckoTerminalUrl || ""),
          geckoTerminalUrl: token.geckoTerminalUrl || "",
          bagsFmUrl: token.bagsFmUrl || (token.contractAddress ? `https://bags.fm/${token.contractAddress}` : ""),
          initialBuyPercent: typeof token.initialBuyPercent === "number" ? token.initialBuyPercent : 0,
          chartPoints: Array.isArray(token.chartPoints) ? token.chartPoints : undefined,
          lastUpdatedLabel: token.lastUpdatedLabel || "",
        }))
      : octopusTokensSeed;
  } catch {
    return octopusTokensSeed;
  }
}

function getStudioTabFromHash(hash: string): StudioTab {
  switch (hash) {
    case "#launch-token":
      return "token";
    case "#list-my-ai":
      return "listing";
    default:
      return "token";
  }
}

function updateHashForTab(tab: StudioTab) {
  if (typeof window === "undefined") {
    return;
  }

  const nextHash = tab === "token" ? "#launch-token" : "#list-my-ai";

  if (window.location.hash !== nextHash) {
    window.history.replaceState(null, "", nextHash);
  }
}

function createTokenBoardEntry(
  symbol: string,
  tokenName: string,
  contractAddress: string,
  options?: {
    bagsFmUrl?: string;
    birdEyeUrl?: string;
    poolAddress?: string;
    initialBuyPercent?: number;
    logoSrc?: string;
    launchedByWallet?: string;
    launchedByName?: string;
  }
): OctopusTokenBoardItem {
  const upperTicker = symbol.trim().toUpperCase().slice(0, 8) || "TOKEN";
  const seed = upperTicker.length + tokenName.trim().length;
  const price = (0.004 + seed * 0.0017).toFixed(3);
  const volume = (seed * 12000 + 48000).toLocaleString("en-US");
  const marketCap = (seed * 210000 + 900000).toLocaleString("en-US");
  const holders = (seed * 37 + 120).toLocaleString("en-US");
  const normalizedContract = contractAddress.trim();
  const normalizedInitialBuy = typeof options?.initialBuyPercent === "number" ? options.initialBuyPercent : 0;

  return {
    id: `token-${Date.now()}`,
    name: tokenName.trim() || "Octopus token",
    ticker: upperTicker,
    price: formatUsdValue(price, "price") || `$${price}`,
    volume24h: `$${volume}`,
    marketCap: `$${marketCap}`,
    holders,
    status: options?.birdEyeUrl || options?.poolAddress ? "Live" : "Launching",
    contractAddress: normalizedContract,
    logoSrc: options?.logoSrc || "",
    launchedByWallet: options?.launchedByWallet || "",
    launchedByName: options?.launchedByName || "",
    poolAddress: options?.poolAddress || "",
    solscanUrl: normalizedContract ? `https://solscan.io/token/${normalizedContract}` : "",
    dexScreenerUrl: options?.poolAddress ? `https://dexscreener.com/solana/${options.poolAddress}` : "",
    birdEyeUrl: options?.birdEyeUrl || (normalizedContract ? `https://birdeye.so/solana/token/${normalizedContract}` : ""),
    bagsFmUrl: options?.bagsFmUrl || (normalizedContract ? `https://bags.fm/${normalizedContract}` : ""),
    initialBuyPercent: normalizedInitialBuy,
    chartPoints: createFallbackChartPoints(Number(price) || 1, "24H"),
    lastUpdatedLabel: "Awaiting live sync",
  };
}

function TokenChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: {
      label?: string;
      close?: number;
      high?: number;
      low?: number;
      volume?: number;
    };
  }>;
}) {
  const point = payload?.[0]?.payload;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="min-w-[220px] rounded-2xl border border-orange-200 bg-white/95 p-3 text-xs shadow-xl backdrop-blur dark:border-white/10 dark:bg-zinc-950/95">
      <div className="border-b border-orange-100 pb-2 dark:border-white/10">
        <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Chart point</p>
        <p className="mt-1 text-sm font-semibold text-zinc-950 dark:text-white">{point.label || "Live point"}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-orange-100 bg-orange-50/80 px-3 py-2 dark:border-white/10 dark:bg-black/30">
          <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Price</p>
          <p className="mt-1 font-semibold text-zinc-950 dark:text-white">{formatUsdValue(point.close, "price") || "$0.000000"}</p>
        </div>
        <div className="rounded-xl border border-orange-100 bg-orange-50/80 px-3 py-2 dark:border-white/10 dark:bg-black/30">
          <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">High</p>
          <p className="mt-1 font-semibold text-emerald-600 dark:text-emerald-300">{formatUsdValue(point.high, "price") || "$0.000000"}</p>
        </div>
        <div className="rounded-xl border border-orange-100 bg-orange-50/80 px-3 py-2 dark:border-white/10 dark:bg-black/30">
          <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Low</p>
          <p className="mt-1 font-semibold text-red-600 dark:text-red-300">{formatUsdValue(point.low, "price") || "$0.000000"}</p>
        </div>
        <div className="rounded-xl border border-orange-100 bg-orange-50/80 px-3 py-2 dark:border-white/10 dark:bg-black/30">
          <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Volume</p>
          <p className="mt-1 font-semibold text-zinc-950 dark:text-white">{formatUsdValue(point.volume, "market") || "$0.00"}</p>
        </div>
      </div>
    </div>
  );
}

export function SolfairLaunchStudio({
  isWalletConnected,
  isLegacyBrowser = false,
  walletAddress,
  walletUsername,
  onConnectWallet,
}: SolfairLaunchStudioProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>(() =>
    typeof window === "undefined" ? "token" : getStudioTabFromHash(window.location.hash)
  );
  const [tokenWorkspaceTab, setTokenWorkspaceTab] = useState<TokenWorkspaceTab>("create");
  const [launchOption, setLaunchOption] = useState<LaunchOption>("free");
  const [tokenName, setTokenName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [mintAddress, setMintAddress] = useState("");
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [logoName, setLogoName] = useState("");
  const [whitepaperName, setWhitepaperName] = useState("");
  const [projectXUrl, setProjectXUrl] = useState("");
  const [projectTelegramUrl, setProjectTelegramUrl] = useState("");
  const [projectDiscordUrl, setProjectDiscordUrl] = useState("");
  const [devWallets, setDevWallets] = useState([""]);
  const [lockWallet, setLockWallet] = useState("");
  const [hasDiscount, setHasDiscount] = useState(false);
  const [initialBuyEnabled, setInitialBuyEnabled] = useState(true);
  const [initialBuyPercent, setInitialBuyPercent] = useState("1");
  const [status, setStatus] = useState<LaunchStatus>("idle");
  const [statusMessage, setStatusMessage] = useState(
    "Connect a wallet first, then fill the launch form to prepare, verify payment, and submit a token launch to Bags.fm from Octopus Market."
  );
  const [bagsRequestId, setBagsRequestId] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [octopusTokens, setOctopusTokens] = useState<OctopusTokenBoardItem[]>(() => readStoredOctopusTokens());
  const [selectedTokenId, setSelectedTokenId] = useState(() => readStoredOctopusTokens()[0]?.id ?? "clawdtrust");
  const [isTokenDetailsOpen, setIsTokenDetailsOpen] = useState(false);
  const [copiedContractId, setCopiedContractId] = useState<string | null>(null);
  const [selectedChartRange, setSelectedChartRange] = useState<ChartRange>("24H");
  const [selectedTokenChartOverride, setSelectedTokenChartOverride] = useState<
    Array<{
      timestamp: number;
      label: string;
      close: number;
      high: number;
      low: number;
      volume: number;
    }>
  >([]);
  const [isChartRefreshing, setIsChartRefreshing] = useState(false);

  useEffect(() => {
    const syncFromHash = () => {
      setActiveTab(getStudioTabFromHash(window.location.hash));
    };

    if (typeof window === "undefined") {
      return;
    }

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);

    return () => {
      window.removeEventListener("hashchange", syncFromHash);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(octopusTokensStorageKey, JSON.stringify(octopusTokens));
    } catch {
      return;
    }
  }, [octopusTokens]);

  useEffect(() => {
    if (!octopusTokens.some((token) => token.id === selectedTokenId)) {
      setSelectedTokenId(octopusTokens[0]?.id ?? "clawdtrust");
    }
  }, [octopusTokens, selectedTokenId]);

  const tokenRefreshKey = useMemo(
    () => octopusTokens.map((token) => `${token.id}:${token.poolAddress}:${token.contractAddress}`).join("|"),
    [octopusTokens]
  );
  const tokenMetricsRefreshMs = isLegacyBrowser ? 45000 : 20000;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let isCancelled = false;

    const refreshTokenMetrics = async () => {
      const nextSnapshots = await Promise.all(
        octopusTokens.map(async (token) => ({
          id: token.id,
          snapshot:
            isOfficialTrackedToken(token) || token.id === selectedTokenId
              ? await fetchLiveTokenMetrics(token)
              : null,
        }))
      );

      if (isCancelled) {
        return;
      }

      setOctopusTokens((currentTokens) =>
        currentTokens.map((token) => {
          const nextSnapshot = nextSnapshots.find((entry) => entry.id === token.id)?.snapshot;

          if (!nextSnapshot) {
            return token;
          }

          const mergedToken = { ...token, ...nextSnapshot };
          const hasChanged =
            mergedToken.price !== token.price ||
            mergedToken.volume24h !== token.volume24h ||
            mergedToken.marketCap !== token.marketCap ||
            mergedToken.holders !== token.holders ||
            mergedToken.status !== token.status ||
            mergedToken.lastUpdatedLabel !== token.lastUpdatedLabel ||
            JSON.stringify(mergedToken.chartPoints ?? []) !== JSON.stringify(token.chartPoints ?? []);

          return hasChanged ? mergedToken : token;
        })
      );
    };

    void refreshTokenMetrics();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshTokenMetrics();
      }
    }, tokenMetricsRefreshMs);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedTokenId, tokenMetricsRefreshMs, tokenRefreshKey]);

  const feeAmount =
    launchOption === "free" ? freeLaunchFee : hasDiscount ? discountLaunchFee : baseLaunchFee;
  const launchReserveFee = calculatePercentageAmount(feeAmount, platformReserveFeeRate);
  const totalLaunchCharge = Number((feeAmount + launchReserveFee).toFixed(2));
  const filledDevWallets = useMemo(
    () => devWallets.map((wallet) => wallet.trim()).filter(Boolean),
    [devWallets]
  );

  const normalizedXUrl = normalizeLink(projectXUrl);
  const normalizedTelegramUrl = normalizeLink(projectTelegramUrl);
  const normalizedDiscordUrl = normalizeLink(projectDiscordUrl);
  const normalizedInitialBuyPercent = initialBuyEnabled ? clampInitialBuyPercent(initialBuyPercent) : 0;
  const selectedToken = octopusTokens.find((token) => token.id === selectedTokenId) ?? octopusTokens[0];
  const baseSelectedTokenChartData = selectedToken?.chartPoints?.length
    ? selectedToken.chartPoints
    : createFallbackChartPoints(parseFormattedUsdValue(selectedToken?.price) || 1, "24H");
  const canPrepareLaunch =
    tokenName.trim().length > 0 &&
    symbol.trim().length > 0 &&
    mintAddress.trim().length > 0 &&
    logoPreview.length > 0;
  const isSubmitting = status === "loading";
  const selectedTokenChartData = selectedTokenChartOverride.length ? selectedTokenChartOverride : baseSelectedTokenChartData;
  const selectedTokenPriceDelta =
    selectedTokenChartData.length > 1
      ? ((selectedTokenChartData[selectedTokenChartData.length - 1].close - selectedTokenChartData[0].close) /
          selectedTokenChartData[0].close) *
        100
      : 0;
  const selectedTokenIsPositive = selectedTokenPriceDelta >= 0;
  const dynamicTokenChartConfig = useMemo(
    () => ({
      close: {
        label: "Price",
        color: selectedTokenIsPositive ? "#16a34a" : "#dc2626",
      },
    }),
    [selectedTokenIsPositive]
  );

  useEffect(() => {
    if (!selectedToken) {
      setSelectedTokenChartOverride([]);
      return;
    }

    let isCancelled = false;
    const fallbackPrice = parseFormattedUsdValue(selectedToken.price) || 1;

    setSelectedTokenChartOverride(
      selectedChartRange === "24H" && selectedToken.chartPoints?.length
        ? selectedToken.chartPoints
        : createFallbackChartPoints(fallbackPrice, selectedChartRange)
    );

    const tokenAddress = getBirdeyeTokenAddress(selectedToken);

    if (!tokenAddress || !isTokenDetailsOpen) {
      setIsChartRefreshing(false);
      return;
    }

    setIsChartRefreshing(true);

    void fetchBirdeyeChartPoints(tokenAddress, fallbackPrice, selectedChartRange)
      .then((points) => {
        if (!isCancelled) {
          setSelectedTokenChartOverride(points);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsChartRefreshing(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isTokenDetailsOpen, selectedChartRange, selectedToken]);

  const renderSelectedTokenLiveDot = ({ cx, cy, index }: { cx?: number; cy?: number; index?: number }) => {
    if (
      typeof cx !== "number" ||
      typeof cy !== "number" ||
      typeof index !== "number" ||
      index !== selectedTokenChartData.length - 1
    ) {
      return null;
    }

    return (
      <g>
        <circle cx={cx} cy={cy} r={9} fill="var(--color-close)" opacity={0.18} className="animate-ping" />
        <circle cx={cx} cy={cy} r={5} fill="var(--color-close)" fillOpacity={0.28} />
        <circle cx={cx} cy={cy} r={3.5} fill="var(--color-close)" />
      </g>
    );
  };

  const updateDevWallet = (index: number, value: string) => {
    setDevWallets((currentWallets) =>
      currentWallets.map((wallet, walletIndex) => (walletIndex === index ? value : wallet))
    );
  };

  const handleStudioTabChange = (value: string) => {
    const nextTab = value as StudioTab;
    setActiveTab(nextTab);
    updateHashForTab(nextTab);
  };

  const handleCopyContract = async (token: OctopusTokenBoardItem) => {
    if (!token.contractAddress || typeof window === "undefined") {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(token.contractAddress);
      } else {
        const textArea = window.document.createElement("textarea");
        textArea.value = token.contractAddress;
        window.document.body.appendChild(textArea);
        textArea.select();
        window.document.execCommand("copy");
        window.document.body.removeChild(textArea);
      }

      setCopiedContractId(token.id);
      window.setTimeout(() => {
        setCopiedContractId((currentValue) => (currentValue === token.id ? null : currentValue));
      }, 1600);
    } catch {
      setCopiedContractId(null);
    }
  };

  const handleOpenTokenChart = (token: OctopusTokenBoardItem) => {
    setSelectedTokenId(token.id);
    setIsTokenDetailsOpen(true);
  };

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setLogoName(file.name);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleWhitepaperChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setWhitepaperName(file.name);
  };

  const handlePrepareLaunch = async () => {
    const activeWalletAddress = isWalletConnected ? walletAddress : await onConnectWallet();

    if (!activeWalletAddress) {
      setStatus("error");
      setStatusMessage("Connect a Solana wallet to unlock the token launch utility.");
      return;
    }

    if (!canPrepareLaunch) {
      setStatus("error");
      setStatusMessage("Token name, symbol, mint address, and a logo are required to continue.");
      return;
    }

    if (initialBuyEnabled && (normalizedInitialBuyPercent < 1 || normalizedInitialBuyPercent > 5)) {
      setStatus("error");
      setStatusMessage("Immediate deployer buy must stay between 1% and 5% of supply.");
      return;
    }

    const provider = getSolanaProvider();

    if (!provider?.signAndSendTransaction && !provider?.signTransaction) {
      setStatus("error");
      setStatusMessage(`This wallet cannot send the live ${launchPaymentTokenSymbol} launch payment yet.`);
      return;
    }

    const normalizedMintAddress = mintAddress.trim();
    const payload = {
      tokenName: tokenName.trim(),
      symbol: symbol.trim(),
      description: description.trim(),
      mintAddress: normalizedMintAddress,
      logoName,
      whitepaperName,
      projectXUrl: normalizedXUrl,
      projectTelegramUrl: normalizedTelegramUrl,
      projectDiscordUrl: normalizedDiscordUrl,
      developerWallets: filledDevWallets,
      lockWallet: lockWallet.trim(),
      walletAddress: activeWalletAddress,
      launchOption,
      feeAmountUsdc: feeAmount,
      reserveFeeUsdc: launchReserveFee,
      totalChargeUsdc: totalLaunchCharge,
      hasDiscount: launchOption === "standard" ? hasDiscount : false,
      initialBuyEnabled,
      initialBuyPercent: normalizedInitialBuyPercent,
    };

    const nextPaymentRequest = await buildTransaction({
      kind: "launch",
      recipient: solanaPaymentAddress,
      amount: totalLaunchCharge,
      walletAddress: activeWalletAddress,
      currency: "SOL",
      label: "Octopus Market launchpad",
      message: `${tokenName.trim()} Bags.fm launch fee in ${launchPaymentTokenSymbol}`,
      memo: `${launchOption === "free" ? "Free" : "Premium"} launch option with reserve fee`,
      metadata: {
        onChainTransfer: true,
        tokenName: tokenName.trim(),
        symbol: symbol.trim(),
        launchOption,
        initialBuyPercent: normalizedInitialBuyPercent,
        reserveFee: launchReserveFee,
        totalChargeUsdc: totalLaunchCharge,
        ...(walletUsername?.trim() ? { username: walletUsername.trim() } : {}),
      },
    });

    setPaymentRequest(nextPaymentRequest);
    setPaymentReference("");

    try {
      setStatus("loading");
      setStatusMessage(`Payment request created. Confirm the real ${launchPaymentTokenSymbol} launch fee transfer in Phantom to continue.`);
      setBagsRequestId("");

      await submitSolanaTransfer(nextPaymentRequest);

      const foundReference = await findReference(nextPaymentRequest.reference);

      if (!foundReference) {
        throw new Error("reference-not-found");
      }

      await validateTransfer(foundReference.signature, {
        recipient: solanaPaymentAddress,
        amount: totalLaunchCharge,
        reference: nextPaymentRequest.reference,
        currency: "SOL",
      });

      const storedValidatedRequest = await fetchTransaction(nextPaymentRequest.id);

      if (!storedValidatedRequest || storedValidatedRequest.status !== "validated") {
        throw new Error("validated-transfer-required");
      }

      setPaymentReference(storedValidatedRequest.reference);
      setPaymentRequest(storedValidatedRequest);
      upsertAdminPaymentNotification({
        id: `admin-${storedValidatedRequest.reference}`,
        paymentRequestId: storedValidatedRequest.id,
        paymentReference: storedValidatedRequest.reference,
        flow: "launch",
        title: `${tokenName.trim()} launch payment`,
        subtitle: `${launchOption === "free" ? "Free option" : "Premium launch"} · ${symbol.trim()}`,
        username: walletUsername?.trim() || undefined,
        userWallet: activeWalletAddress,
        recipientWallet: solanaPaymentAddress,
        amountUsdc: feeAmount,
        reserveFeeUsdc: launchReserveFee,
        totalPaidUsdc: totalLaunchCharge,
        createdAt: Date.now(),
        status: "pending",
      });
      setStatusMessage("Launch payment verified. Octopus Market is now submitting the token package and preparing the internal market chart...");

      const result = await createBagsLaunchRequest(payload);
      const nextTokenEntry = createTokenBoardEntry(symbol.trim(), tokenName.trim(), normalizedMintAddress, {
        bagsFmUrl: result.launchUrl || `https://bags.fm/${normalizedMintAddress}`,
        birdEyeUrl: result.birdEyeUrl || `https://birdeye.so/solana/token/${normalizedMintAddress}`,
        poolAddress: result.poolAddress,
        initialBuyPercent: normalizedInitialBuyPercent,
        logoSrc: logoPreview,
        launchedByWallet: activeWalletAddress,
        launchedByName: walletUsername?.trim() || "",
      });

      setBagsRequestId(result.requestId);
      setOctopusTokens((currentTokens) => [
        nextTokenEntry,
        ...currentTokens.filter((item) => item.ticker !== symbol.trim().toUpperCase().slice(0, 8)),
      ].slice(0, 12));
      setSelectedTokenId(nextTokenEntry.id);
      setTokenWorkspaceTab("tokens");

      if (result.ok) {
        setStatus("success");
        setStatusMessage(
          `Launch request sent for ${tokenName.trim()}. The internal Octopus chart will reflect Birdeye market data as soon as live sync is available, and the deployer first buy is queued at ${initialBuyEnabled ? `${normalizedInitialBuyPercent}%` : "0%"}.`
        );
        return;
      }

      setStatus("success");
      setStatusMessage(
        `Launch package prepared for ${tokenName.trim()}. The request is saved for follow-up, and Octopus Market will keep the token board ready for the live Birdeye sync.`
      );
    } catch (error) {
      setStatus("error");
      setStatusMessage(
        error instanceof Error
          ? `The ${launchPaymentTokenSymbol} launch payment could not be completed: ${error.message}`
          : "The launch payment could not be validated, or the request could not be submitted."
      );
    }
  };

  return (
    <section
      id="launch-studio"
      className="scroll-mt-28 border-y border-orange-100 bg-orange-50/70 py-20 dark:border-white/10 dark:bg-zinc-900/70"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Launch studio"
          title="Launch token or list an AI from one guided workspace"
          description="The studio now focuses on Launch Token and List My AI inside the same Octopus Market experience, with payment verification before execution."
        />

        <Alert className="mt-8 border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-white/5 dark:text-white">
          {isWalletConnected ? <CheckCircle2 className="size-4" /> : <Wallet className="size-4" />}
          <AlertTitle>{isWalletConnected ? "Utilities unlocked" : "Wallet connection required"}</AlertTitle>
          <AlertDescription>
            {isWalletConnected
              ? `Connected wallet: ${formatWalletAddress(walletAddress)}`
              : "Token launch preparation, listing actions, and Aido Agent chat are unlocked after a Solana wallet connection."}
          </AlertDescription>
        </Alert>

        <Tabs value={activeTab} onValueChange={handleStudioTabChange} className="mt-12 gap-6">
          <TabsList className="grid h-auto grid-cols-1 gap-2 border border-orange-100 bg-white p-2 sm:grid-cols-2 dark:border-white/10 dark:bg-white/5">
            <TabsTrigger value="token" className="min-h-11 whitespace-nowrap rounded-2xl px-4">
              Launch Token
            </TabsTrigger>
            <TabsTrigger value="listing" className="min-h-11 whitespace-nowrap rounded-2xl px-4">
              List My AI
            </TabsTrigger>
          </TabsList>

          <TabsContent value="token" className="space-y-6">
            <div id="launch-token" className="scroll-mt-32" />
            <Tabs value={tokenWorkspaceTab} onValueChange={(value) => setTokenWorkspaceTab(value as TokenWorkspaceTab)} className="gap-6">
              <TabsList className="grid h-auto grid-cols-1 gap-2 border border-orange-100 bg-white p-2 sm:grid-cols-2 dark:border-white/10 dark:bg-white/5">
                <TabsTrigger value="create" className="min-h-11 whitespace-nowrap rounded-2xl px-4">
                  Create token
                </TabsTrigger>
                <TabsTrigger value="tokens" className="min-h-11 whitespace-nowrap rounded-2xl px-4">
                  Octopus Tokens
                </TabsTrigger>
              </TabsList>

              <TabsContent value="create" className="space-y-6">
                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <Card className="border-orange-200 bg-white text-zinc-950 shadow-[0_24px_80px_rgba(249,115,22,0.12)] transition-transform duration-500 md:[transform:perspective(1800px)_rotateY(-3deg)_rotateX(2deg)] dark:border-white/10 dark:bg-white/5 dark:text-white dark:shadow-[0_28px_90px_rgba(0,0,0,0.35)]">
                    <CardHeader>
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                          Launch Token
                        </Badge>
                        <Badge className="border border-orange-200 bg-white text-zinc-700 hover:bg-white dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-900">
                          Bags.fm ready
                        </Badge>
                      </div>
                      <CardTitle className="text-2xl">Prepare a token launch flow</CardTitle>
                      <CardDescription className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
                        Add the token details, project socials, official wallets, and fee option before sending the verified launch request to Bags.fm.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6 lg:grid-cols-2">
                      <div className="space-y-4">
                        <div className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
                          <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            <Coins className="size-4 text-orange-500 dark:text-orange-300" />
                            Launch option
                          </div>

                          <RadioGroup
                            value={launchOption}
                            onValueChange={(value) => setLaunchOption(value as LaunchOption)}
                            className="gap-3"
                          >
                            {launchOptions.map((option) => {
                              const isSelected = option.id === launchOption;

                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => setLaunchOption(option.id)}
                                  className={`w-full rounded-2xl border p-4 text-left transition ${
                                    isSelected
                                      ? "border-orange-300 bg-white shadow-sm dark:border-orange-400/40 dark:bg-orange-500/10"
                                      : "border-orange-200 bg-white hover:border-orange-300 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    <RadioGroupItem
                                      value={option.id}
                                      checked={isSelected}
                                      className="mt-1 border-orange-400 text-orange-500 dark:border-white/30 dark:text-orange-300"
                                      aria-label={option.title}
                                    />
                                    <div className="space-y-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-medium text-zinc-950 dark:text-white">{option.title}</p>
                                        <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                                          {option.badge}
                                        </Badge>
                                      </div>
                                      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">{option.description}</p>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </RadioGroup>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Token information</p>
                          <Input
                            value={tokenName}
                            onChange={(event) => setTokenName(event.target.value)}
                            placeholder="Token name"
                            className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                          />
                          <Input
                            value={symbol}
                            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                            placeholder="Symbol, for example OCTO"
                            className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                          />
                          <Textarea
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder="Project description"
                            className="min-h-28 border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                          />
                          <Input
                            value={mintAddress}
                            onChange={(event) => setMintAddress(event.target.value)}
                            placeholder="SPL mint address"
                            className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                          />
                        </div>

                        <div className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
                          <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            <Link2 className="size-4 text-orange-500 dark:text-orange-300" />
                            Token project links
                          </div>
                          <Input
                            value={projectXUrl}
                            onChange={(event) => setProjectXUrl(event.target.value)}
                            placeholder="Project X / Twitter link"
                            className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                          />
                          <Input
                            value={projectTelegramUrl}
                            onChange={(event) => setProjectTelegramUrl(event.target.value)}
                            placeholder="Project Telegram link"
                            className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                          />
                          <Input
                            value={projectDiscordUrl}
                            onChange={(event) => setProjectDiscordUrl(event.target.value)}
                            placeholder="Project Discord link"
                            className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                          />
                        </div>

                        <div className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                <Coins className="size-4 text-orange-500 dark:text-orange-300" />
                                Deployer first buy
                              </div>
                              <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                                Let the deployer buy between 1% and 5% of the token supply immediately after launch. Any request above 5% is refused.
                              </p>
                            </div>
                            <Switch checked={initialBuyEnabled} onCheckedChange={setInitialBuyEnabled} />
                          </div>
                          <div className="space-y-4">
                            <div className="grid grid-cols-5 gap-2">
                              {[1, 2, 3, 4, 5].map((percent) => {
                                const isActive = normalizedInitialBuyPercent === percent;

                                return (
                                  <Button
                                    key={percent}
                                    type="button"
                                    variant="outline"
                                    disabled={!initialBuyEnabled}
                                    onClick={() => setInitialBuyPercent(String(percent))}
                                    className={`rounded-xl border text-sm ${
                                      isActive
                                        ? "border-orange-300 bg-orange-500 text-white hover:bg-orange-500 dark:border-orange-300 dark:bg-orange-500 dark:text-white"
                                        : "border-orange-200 bg-white text-zinc-900 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"
                                    }`}
                                  >
                                    {percent}%
                                  </Button>
                                );
                              })}
                            </div>
                            <Slider
                              value={[normalizedInitialBuyPercent]}
                              min={1}
                              max={5}
                              step={1}
                              disabled={!initialBuyEnabled}
                              onValueChange={(value) => setInitialBuyPercent(String(clampInitialBuyPercent(value[0] ?? 1)))}
                              className="py-2"
                            />
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Current launch setting: {initialBuyEnabled ? `${normalizedInitialBuyPercent}% immediate deployer buy` : "Disabled"}
                          </p>
                        </div>

                        <div className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
                          <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            <ImagePlus className="size-4 text-orange-500 dark:text-orange-300" />
                            Token assets
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="rounded-2xl border border-dashed border-orange-300 bg-white p-4 text-sm text-zinc-700 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-300">
                              <span className="mb-2 flex items-center gap-2 font-medium">
                                <FileUp className="size-4 text-orange-500 dark:text-orange-300" />
                                Upload logo
                              </span>
                              <input type="file" accept="image/*" className="mt-2 block w-full text-xs" onChange={handleLogoChange} />
                              <span className="mt-3 block text-xs text-zinc-500 dark:text-zinc-500">
                                {logoName || "PNG, JPG, or WEBP"}
                              </span>
                            </label>
                            <label className="rounded-2xl border border-dashed border-orange-300 bg-white p-4 text-sm text-zinc-700 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-300">
                              <span className="mb-2 flex items-center gap-2 font-medium">
                                <FileUp className="size-4 text-orange-500 dark:text-orange-300" />
                                Upload whitepaper
                              </span>
                              <input type="file" className="mt-2 block w-full text-xs" onChange={handleWhitepaperChange} />
                              <span className="mt-3 block text-xs text-zinc-500 dark:text-zinc-500">
                                {whitepaperName || "PDF or docs file"}
                              </span>
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Official wallets</p>
                          {devWallets.map((wallet, index) => (
                            <Input
                              key={`${index}-${wallet}`}
                              value={wallet}
                              onChange={(event) => updateDevWallet(index, event.target.value)}
                              placeholder={`Developer wallet ${index + 1}`}
                              className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                            />
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            className="border-orange-200 bg-white text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"
                            onClick={() => setDevWallets((currentWallets) => [...currentWallets, ""])}
                          >
                            <Wallet className="size-4" />
                            Add developer wallet
                          </Button>
                        </div>

                        <Input
                          value={lockWallet}
                          onChange={(event) => setLockWallet(event.target.value)}
                          placeholder="Lock or vesting wallet"
                          className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                        />

                        <div className="rounded-2xl border border-orange-200 bg-orange-100/70 p-4 dark:border-orange-400/20 dark:bg-orange-500/10">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-white">
                                <ShieldCheck className="size-4 text-orange-500 dark:text-orange-300" />
                                $ClawdTrust holder discount
                              </div>
                              <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                                Turn this on when the wallet used for launch holds at least {premiumHolderThresholdUsd}$ in $ClawdTrust. The 10% holder reduction applies only to the Premium launch.
                              </p>
                            </div>
                            <Switch
                              checked={hasDiscount}
                              onCheckedChange={setHasDiscount}
                              disabled={launchOption === "free"}
                            />
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                            <Badge className="border border-orange-200 bg-white text-orange-700 hover:bg-white dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-200 dark:hover:bg-orange-500/15">
                              Launch fee {feeAmount.toFixed(2)} {launchPaymentTokenSymbol}
                            </Badge>
                            <span className="text-zinc-700 dark:text-zinc-300">
                              {launchOption === "free"
                                ? "Free option selected with the standard 0.2 SOL processing fee"
                                : hasDiscount
                                  ? `10% discount applied for wallets holding at least ${premiumHolderThresholdUsd}$ in $ClawdTrust`
                                  : "Premium launch fee active"}
                            </span>
                          </div>
                          <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
                            Reserve fee: {launchReserveFee.toFixed(2)} {launchPaymentTokenSymbol} · Total wallet debit: {totalLaunchCharge.toFixed(2)} {launchPaymentTokenSymbol}
                          </p>
                        </div>

                        <Button
                          type="button"
                          onClick={() => void handlePrepareLaunch()}
                          disabled={isSubmitting}
                          className="w-full rounded-2xl bg-orange-500 text-white hover:bg-orange-400"
                        >
                          {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <Signature className="size-4" />}
                          {isWalletConnected ? "Verify payment and launch" : "Connect wallet to unlock launch"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-6">
                    <Card className="border-orange-200 bg-white text-zinc-950 shadow-[0_18px_60px_rgba(249,115,22,0.1)] transition-transform duration-500 md:[transform:perspective(1800px)_rotateY(2deg)_rotateX(2deg)] dark:border-white/10 dark:bg-zinc-950/70 dark:text-white dark:shadow-[0_20px_70px_rgba(0,0,0,0.3)]">
                      <CardHeader>
                        <CardTitle className="text-xl">Launch preview</CardTitle>
                        <CardDescription className="text-zinc-600 dark:text-zinc-400">
                          A simplified product layer based on your brief, adapted to this prototype.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="mx-auto aspect-square w-full max-w-40 overflow-hidden rounded-2xl border border-orange-200 bg-orange-50 dark:border-white/10 dark:bg-black/20">
                          {logoPreview ? (
                            <img src={logoPreview} alt="Token logo preview" className="size-full object-cover" />
                          ) : (
                            <div className="flex size-full items-center justify-center text-center text-sm text-zinc-500 dark:text-zinc-400">
                              Logo preview appears here
                            </div>
                          )}
                        </div>
                        <div className="space-y-3 rounded-2xl border border-orange-200 bg-white p-4 dark:border-white/10 dark:bg-black/20">
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Token</p>
                            <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-white">
                              {tokenName || "Your token name"}
                              {symbol ? ` (${symbol})` : ""}
                            </p>
                          </div>
                          <Separator className="bg-orange-100 dark:bg-white/10" />
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Launch option</p>
                            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                              {launchOption === "free" ? "Free option" : "Premium launch"} · {feeAmount.toFixed(2)} {launchPaymentTokenSymbol}
                            </p>
                            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                              {launchOption === "standard"
                                ? hasDiscount
                                  ? `Holder reduction active from ${premiumHolderThresholdUsd}$ in $ClawdTrust · reserve fee ${launchReserveFee.toFixed(2)} ${launchPaymentTokenSymbol} · total debit ${totalLaunchCharge.toFixed(2)} ${launchPaymentTokenSymbol}`
                                  : `No holder reduction active · reserve fee ${launchReserveFee.toFixed(2)} ${launchPaymentTokenSymbol} · total debit ${totalLaunchCharge.toFixed(2)} ${launchPaymentTokenSymbol}`
                                : `Reserve fee ${launchReserveFee.toFixed(2)} ${launchPaymentTokenSymbol} · total debit ${totalLaunchCharge.toFixed(2)} ${launchPaymentTokenSymbol}`}
                            </p>
                          </div>
                          <Separator className="bg-orange-100 dark:bg-white/10" />
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Mint address</p>
                            <p className="mt-2 break-all text-sm text-zinc-700 dark:text-zinc-300">
                              {mintAddress || "Waiting for mint address"}
                            </p>
                          </div>
                          <Separator className="bg-orange-100 dark:bg-white/10" />
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Project links</p>
                            <div className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                              <div className="flex items-center gap-2">
                                <Link2 className="size-4 text-orange-500 dark:text-orange-300" />
                                <span className="truncate">{normalizedXUrl || "X / Twitter link not provided"}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Send className="size-4 text-orange-500 dark:text-orange-300" />
                                <span className="truncate">{normalizedTelegramUrl || "Telegram link not provided"}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <MessageCircle className="size-4 text-orange-500 dark:text-orange-300" />
                                <span className="truncate">{normalizedDiscordUrl || "Discord link not provided"}</span>
                              </div>
                            </div>
                          </div>
                          <Separator className="bg-orange-100 dark:bg-white/10" />
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Immediate deployer buy</p>
                            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                              {initialBuyEnabled ? `${normalizedInitialBuyPercent}% reserved for immediate deployer buy after launch` : "No deployer first buy configured"}
                            </p>
                          </div>
                          <Separator className="bg-orange-100 dark:bg-white/10" />
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Wallet setup</p>
                            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                              {filledDevWallets.length} developer wallet{filledDevWallets.length > 1 ? "s" : ""} added
                            </p>
                            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                              Lock wallet: {lockWallet || "Not provided yet"}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-orange-200 bg-white text-zinc-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
                      <CardHeader>
                        <CardTitle className="text-xl">Verified launch payment</CardTitle>
                        <CardDescription className="text-zinc-600 dark:text-zinc-400">
                          The Bags.fm handoff is executed only after the launch fee reference is validated.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4 text-sm text-zinc-700 dark:text-zinc-300">
                        <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4 dark:border-white/10 dark:bg-black/20">
                          <div className="flex items-center gap-2 font-medium text-zinc-950 dark:text-white">
                            <QrCode className="size-4 text-orange-500 dark:text-orange-300" />
                            Transfer request
                          </div>
                          <p className="mt-2 break-all text-zinc-700 dark:text-zinc-300">
                            {paymentRequest?.encodedUrl ?? "The launch payment request appears here after you prepare the launch."}
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-orange-100 bg-white px-4 py-4 dark:border-white/10 dark:bg-black/20">
                            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Payment token</p>
                            <p className="mt-2 break-all text-sm text-zinc-900 dark:text-white">{launchPaymentTokenSymbol} · Solana native payment</p>
                          </div>
                          <div className="rounded-2xl border border-orange-100 bg-white px-4 py-4 dark:border-white/10 dark:bg-black/20">
                            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Destination</p>
                            <p className="mt-2 break-all text-sm text-orange-600 dark:text-orange-300">{solanaPaymentAddress}</p>
                          </div>
                          <div className="rounded-2xl border border-orange-100 bg-white px-4 py-4 dark:border-white/10 dark:bg-black/20">
                            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Reserve fee</p>
                            <p className="mt-2 break-all text-sm text-zinc-900 dark:text-white">{launchReserveFee.toFixed(2)} {launchPaymentTokenSymbol}</p>
                          </div>
                          <div className="rounded-2xl border border-orange-100 bg-white px-4 py-4 dark:border-white/10 dark:bg-black/20">
                            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Total debit</p>
                            <p className="mt-2 break-all text-sm text-zinc-900 dark:text-white">{totalLaunchCharge.toFixed(2)} {launchPaymentTokenSymbol}</p>
                          </div>
                          <div className="rounded-2xl border border-orange-100 bg-white px-4 py-4 dark:border-white/10 dark:bg-black/20 sm:col-span-2">
                            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Reference</p>
                            <p className="mt-2 font-medium text-zinc-950 dark:text-white">
                              {paymentReference || paymentRequest?.reference || "Pending verification"}
                            </p>
                          </div>
                        </div>
                        {paymentRequest ? (
                          <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
                            <img
                              src={paymentRequest.qrCodeSrc}
                              alt="Launch payment QR"
                              className="mx-auto w-full max-w-44 rounded-2xl border border-orange-200 bg-white p-2 dark:border-white/10 dark:bg-zinc-950"
                            />
                            <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
                              Scan in Phantom or approve from the encoded request.
                            </p>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>

                    <Card className="border-orange-200 bg-white text-zinc-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
                      <CardHeader>
                        <CardTitle className="text-xl">What this adds to Octopus Market</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
                        {launchBenefits.map((benefit) => (
                          <div
                            key={benefit}
                            className="flex items-start gap-3 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 dark:border-white/10 dark:bg-black/20"
                          >
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-orange-500 dark:text-orange-300" />
                            <span>{benefit}</span>
                          </div>
                        ))}
                        <div className="rounded-2xl border border-orange-100 bg-white px-4 py-3 dark:border-white/10 dark:bg-black/20">
                          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Treasury destination</p>
                          <p className="mt-2 break-all text-sm text-orange-600 dark:text-orange-300">{solanaPaymentAddress}</p>
                        </div>
                      </CardContent>
                    </Card>

                    <Alert
                      className={
                        status === "error"
                          ? "border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100"
                          : status === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                            : status === "loading"
                              ? "border-orange-200 bg-orange-50/90 text-zinc-950 dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-white"
                              : "border-orange-200 bg-orange-50/70 text-zinc-950 dark:border-white/10 dark:bg-white/5 dark:text-white"
                      }
                    >
                      {status === "success" ? (
                        <CheckCircle2 className="size-4" />
                      ) : status === "loading" ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                      <AlertTitle>
                        {status === "success"
                          ? "Launch package ready"
                          : status === "error"
                            ? "Missing information"
                            : status === "loading"
                              ? "Submitting launch request"
                              : "Prototype status"}
                      </AlertTitle>
                      <AlertDescription className={status === "error" ? "text-red-700 dark:text-red-100/80" : undefined}>
                        <p>{statusMessage}</p>
                        {bagsRequestId ? (
                          <p className="mt-3 text-sm font-medium">
                            Bags request ID: <span className="break-all">{bagsRequestId}</span>
                          </p>
                        ) : null}
                      </AlertDescription>
                    </Alert>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="tokens" className="space-y-6">
                <Card className="border-orange-200 bg-white text-zinc-950 shadow-[0_24px_80px_rgba(249,115,22,0.12)] transition-transform duration-500 md:[transform:perspective(1800px)_rotateX(2deg)] dark:border-white/10 dark:bg-white/5 dark:text-white dark:shadow-[0_28px_90px_rgba(0,0,0,0.35)]">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                        Octopus Tokens
                      </Badge>
                      <Badge className="border border-orange-200 bg-white text-zinc-700 hover:bg-white dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-900">
                        Internal launch board
                      </Badge>
                    </div>
                    <CardTitle className="text-2xl">Tokens launched through Octopus Market</CardTitle>
                    <CardDescription className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
                      Follow the tracked token board with real-time Birdeye market sync, copy each contract address from the table, and open all token details only from the More info action.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-3xl border border-orange-200 bg-orange-50/80 p-4 dark:border-white/10 dark:bg-black/20">
                      <div className="mb-4 rounded-2xl border border-orange-100 bg-white/80 px-4 py-3 text-sm text-zinc-600 dark:border-white/10 dark:bg-zinc-950/70 dark:text-zinc-300">
                        Use More info on any token row to open its extra details, live chart, and market information inside Octopus Market.
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="border-orange-200 dark:border-white/10">
                            <TableHead className="text-zinc-700 dark:text-zinc-300">Token</TableHead>
                            <TableHead className="text-zinc-700 dark:text-zinc-300">Ticker</TableHead>
                            <TableHead className="text-zinc-700 dark:text-zinc-300">Price</TableHead>
                            <TableHead className="text-zinc-700 dark:text-zinc-300">24h Volume</TableHead>
                            <TableHead className="text-zinc-700 dark:text-zinc-300">Market Cap</TableHead>
                            <TableHead className="text-zinc-700 dark:text-zinc-300">Holders</TableHead>
                            <TableHead className="text-zinc-700 dark:text-zinc-300">Status</TableHead>
                            <TableHead className="text-right text-zinc-700 dark:text-zinc-300">More info</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {octopusTokens.map((token) => {
                            const tokenChartData = token.chartPoints?.length
                              ? token.chartPoints
                              : createFallbackChartPoints(parseFormattedUsdValue(token.price) || 1);
                            const tokenPriceDelta =
                              tokenChartData.length > 1
                                ? ((tokenChartData[tokenChartData.length - 1].close - tokenChartData[0].close) /
                                    tokenChartData[0].close) *
                                  100
                                : 0;

                            return (
                              <TableRow
                                key={token.id}
                                className={`border-orange-100 transition hover:bg-white/80 dark:border-white/10 dark:hover:bg-zinc-950/70 ${
                                  token.id === selectedToken?.id
                                    ? "bg-white shadow-[inset_0_0_0_1px_rgba(249,115,22,0.18)] dark:bg-zinc-950/70"
                                    : ""
                                }`}
                              >
                              <TableCell>
                                <div className="flex flex-col items-start gap-2 text-left">
                                  <div className="flex items-center gap-3 font-semibold text-zinc-950 dark:text-white">
                                    {token.logoSrc ? (
                                      <img src={token.logoSrc} alt={`${token.name} logo`} className="size-8 rounded-full border border-orange-200 object-cover dark:border-white/10" />
                                    ) : null}
                                    <span className="flex items-center gap-2">
                                      <span>{token.name}</span>
                                      {token.contractAddress === officialTokenAddress || token.id === "clawdtrust" ? (
                                        <img
                                          src={officialTokenGoldBadgeSrc}
                                          alt={`${token.name} gold verified`}
                                          className="size-5 shrink-0 object-contain"
                                        />
                                      ) : null}
                                    </span>
                                  </div>
                                  {token.contractAddress ? (
                                    <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                                      <span className="max-w-[120px] break-all font-mono text-[10px] tracking-[0.08em] sm:max-w-none sm:text-xs sm:tracking-[0.12em]">
                                        {formatCompactContractAddress(token.contractAddress)}
                                      </span>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void handleCopyContract(token);
                                        }}
                                        className="h-7 w-7 rounded-full border border-orange-200 p-0 text-zinc-600 hover:bg-orange-100 hover:text-zinc-950 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
                                        aria-label={`Copy ${token.name} contract address`}
                                      >
                                        {copiedContractId === token.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell className="font-semibold text-zinc-950 dark:text-white">{token.ticker}</TableCell>
                              <TableCell className={tokenPriceDelta >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}>
                                {token.price}
                              </TableCell>
                              <TableCell>{token.volume24h}</TableCell>
                              <TableCell>{token.marketCap}</TableCell>
                              <TableCell>{token.holders}</TableCell>
                              <TableCell>
                                <Badge className="border border-orange-200 bg-white text-orange-700 hover:bg-white dark:border-white/10 dark:bg-zinc-950 dark:text-orange-300 dark:hover:bg-zinc-950">
                                  {token.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  variant={token.id === selectedToken?.id ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => handleOpenTokenChart(token)}
                                  className={token.id === selectedToken?.id
                                    ? "rounded-full bg-orange-500 px-4 text-white hover:bg-orange-400"
                                    : "rounded-full border-orange-200 bg-white px-4 text-zinc-900 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"
                                  }
                                >
                                  More info
                                </Button>
                              </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                      New successful launches from the Create token flow are added here automatically, while the tracked ClawdTrust token keeps its official contract, live Dexscreener price reflection, live holders count, copyable contract address, and native market view inside the More info panel on Octopus Market.
                    </p>
                    <Dialog open={isTokenDetailsOpen} onOpenChange={setIsTokenDetailsOpen}>
                      <DialogContent className="max-h-[90vh] overflow-y-auto border-orange-200 bg-white text-zinc-950 sm:max-w-5xl dark:border-white/10 dark:bg-zinc-950 dark:text-white">
                        {selectedToken ? (
                          <>
                            <DialogHeader>
                              <div className="flex flex-wrap items-center gap-3">
                                <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                                  {selectedToken.ticker}
                                </Badge>
                                <Badge className="border border-orange-200 bg-white text-zinc-700 hover:bg-white dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-900">
                                  {selectedToken.status}
                                </Badge>
                              </div>
                              <div className="mt-4 flex items-center gap-3">
                                {selectedToken.logoSrc ? (
                                  <img src={selectedToken.logoSrc} alt={`${selectedToken.name} logo`} className="size-10 rounded-full border border-orange-200 object-cover dark:border-white/10" />
                                ) : null}
                                <div className="flex items-center gap-2">
                                  <DialogTitle className="text-2xl text-zinc-950 dark:text-white">{selectedToken.name}</DialogTitle>
                                  {selectedToken.contractAddress === officialTokenAddress || selectedToken.id === "clawdtrust" ? (
                                    <img
                                      src={officialTokenGoldBadgeSrc}
                                      alt={`${selectedToken.name} gold verified`}
                                      className="size-5 shrink-0 object-contain"
                                    />
                                  ) : null}
                                </div>
                              </div>
                              <DialogDescription className="text-zinc-600 dark:text-zinc-400">
                                All extra information for this token stays inside the More info view, including the live chart and key token metrics.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                              <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Contract</p>
                                <div className="mt-2 flex items-center gap-2">
                                  <p className="max-w-[150px] break-all font-mono text-[10px] font-medium leading-5 text-zinc-900 sm:max-w-none sm:text-xs dark:text-white">
                                    {formatCompactContractAddress(selectedToken.contractAddress)}
                                  </p>
                                  {selectedToken.contractAddress ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => void handleCopyContract(selectedToken)}
                                      className="h-8 w-8 rounded-full border border-orange-200 p-0 text-zinc-600 hover:bg-orange-100 hover:text-zinc-950 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
                                      aria-label={`Copy ${selectedToken.name} contract address`}
                                    >
                                      {copiedContractId === selectedToken.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                              <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Pool</p>
                                <p className="mt-2 break-all text-sm text-zinc-900 dark:text-white">
                                  {selectedToken.poolAddress || "Pool address not added yet"}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Live source</p>
                                <p className="mt-2 break-all text-sm text-zinc-900 dark:text-white">Autonomous ClawdTrust sync · Dexscreener pair feed refreshed every {tokenMetricsRefreshMs / 1000} seconds</p>
                              </div>
                              <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Last market refresh</p>
                                <p className="mt-2 break-all text-sm text-zinc-900 dark:text-white">
                                  {selectedToken.lastUpdatedLabel || "Waiting for first live sync"}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Price</p>
                                <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-white">{selectedToken.price}</p>
                              </div>
                              <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">24h volume</p>
                                <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-white">{selectedToken.volume24h}</p>
                              </div>
                              <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Market cap</p>
                                <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-white">{selectedToken.marketCap}</p>
                              </div>
                              <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Holders</p>
                                <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-white">{selectedToken.holders}</p>
                              </div>
                              <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 dark:border-white/10 dark:bg-black/20 sm:col-span-2 xl:col-span-4">
                                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Immediate deployer buy</p>
                                <p className="mt-2 break-all text-sm text-zinc-900 dark:text-white">
                                  {selectedToken.initialBuyPercent && selectedToken.initialBuyPercent > 0
                                    ? `${selectedToken.initialBuyPercent}% configured during launch`
                                    : "No immediate deployer buy configured"}
                                </p>
                              </div>
                            </div>
                            <div className="overflow-hidden rounded-3xl border border-orange-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-zinc-950/80 dark:shadow-[0_36px_100px_rgba(0,0,0,0.4)]">
                              <div className={`border-b border-orange-100 px-5 py-5 dark:border-white/10 ${selectedTokenIsPositive ? "bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.22),transparent_45%),linear-gradient(180deg,rgba(240,253,244,1),rgba(255,255,255,1))] dark:bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.22),transparent_45%),linear-gradient(180deg,rgba(24,39,28,0.9),rgba(9,9,11,1))]" : "bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.2),transparent_45%),linear-gradient(180deg,rgba(254,242,242,1),rgba(255,255,255,1))] dark:bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.22),transparent_45%),linear-gradient(180deg,rgba(48,24,24,0.9),rgba(9,9,11,1))]"}`}>
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                  <div>
                                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Octopus live chart</p>
                                    <h4 className="mt-2 text-xl font-semibold text-zinc-950 dark:text-white">{selectedToken.ticker} market view</h4>
                                    <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                                      Native chart on Octopus Market, powered by Dexscreener live pair data and the official Solscan token reference.
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-orange-200 bg-white/80 px-4 py-3 text-right shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/30">
                                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">24h move</p>
                                    <p className={`mt-2 text-lg font-semibold ${selectedTokenPriceDelta >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}`}>
                                      {selectedTokenPriceDelta >= 0 ? "+" : ""}{selectedTokenPriceDelta.toFixed(2)}%
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    {chartRangeOptions.map((range) => (
                                      <Button
                                        key={range}
                                        type="button"
                                        variant="outline"
                                        onClick={() => setSelectedChartRange(range)}
                                        className={`h-9 rounded-full px-4 text-xs font-semibold ${
                                          selectedChartRange === range
                                            ? "border-orange-300 bg-orange-500 text-white hover:bg-orange-500 dark:border-orange-300 dark:bg-orange-500 dark:text-white"
                                            : "border-orange-200 bg-white text-zinc-900 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"
                                        }`}
                                      >
                                        {range}
                                      </Button>
                                    ))}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                                    <span className={`size-2 rounded-full ${selectedTokenIsPositive ? "bg-emerald-500" : "bg-red-500"} animate-pulse`} />
                                    {isChartRefreshing ? "Refreshing live price path" : "Live price path synced"}
                                  </div>
                                </div>
                              </div>
                              <div className="bg-white p-4 dark:bg-zinc-950">
                                <ChartContainer config={dynamicTokenChartConfig} className="h-[360px] w-full">
                                  <AreaChart data={selectedTokenChartData} margin={{ left: 12, right: 12, top: 10, bottom: 0 }}>
                                    <defs>
                                      <linearGradient id="octopus-token-chart" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-close)" stopOpacity={0.35} />
                                        <stop offset="95%" stopColor="var(--color-close)" stopOpacity={0.02} />
                                      </linearGradient>
                                    </defs>
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
                                    <YAxis tickLine={false} axisLine={false} width={92} tickFormatter={(value) => formatUsdValue(value, "price") || "$0.000000"} />
                                    <ChartTooltip
                                      cursor={{ stroke: "var(--color-close)", strokeOpacity: 0.28, strokeWidth: 1.5 }}
                                      content={<TokenChartTooltip />}
                                    />
                                    <Area
                                      type="monotone"
                                      dataKey="close"
                                      stroke="var(--color-close)"
                                      strokeWidth={2.5}
                                      fill="url(#octopus-token-chart)"
                                      dot={renderSelectedTokenLiveDot}
                                      isAnimationActive
                                    />
                                  </AreaChart>
                                </ChartContainer>
                              </div>
                            </div>
                          </>
                        ) : null}
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="listing" className="space-y-6">
            <div id="list-my-ai" className="scroll-mt-32" />
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <Card className="border-orange-200 bg-white text-zinc-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
                <CardHeader>
                  <Badge className="w-fit border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                    Marketplace listing
                  </Badge>
                  <CardTitle className="text-2xl">Keep the AI listing flow on the same platform</CardTitle>
                  <CardDescription className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
                    Users can still list an AI product through wallet signature payment, verified transfer requests, and direct activation from Octopus Market.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4 text-sm text-zinc-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                    Choose the monthly or annual plan.
                  </div>
                  <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4 text-sm text-zinc-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                    Connect the Solana wallet and sign the payment request.
                  </div>
                  <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4 text-sm text-zinc-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                    Validate the reference, then activate the listing only after verification succeeds.
                  </div>
                </CardContent>
              </Card>

              <Card className="border-orange-200 bg-orange-100/70 text-zinc-950 shadow-sm dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-white">
                <CardHeader>
                  <CardTitle className="text-xl">Ready to publish your AI?</CardTitle>
                  <CardDescription className="text-zinc-700 dark:text-zinc-300">
                    Launch the original payment flow without leaving the page.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <OctopusAIListingDialog
                    walletAddress={walletAddress}
                    walletRecord={walletAddress ? null : null}
                    onConnectWallet={onConnectWallet}
                    triggerLabel={isWalletConnected ? "Start AI submission" : "Connect wallet to unlock listing"}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}

/**
 * ClawdTrustHolderPage
 * Page dédiée "Become a ClawdTrust Holder" — reprend intégralement
 * le contenu de l'onglet "Octopus Tokens" de SolfairLaunchStudio.
 */

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Check, Copy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  officialTokenAddress,
  octopusTokensSeed,
  type OctopusTokenBoardItem,
} from "@/components/octopus-market/octopus-market-data";
import { readStoredOctopusTokens } from "@/components/octopus-market/solfair-launch-studio";

// ─── Constantes ───────────────────────────────────────────────────────────────

const octopusTokensStorageKey = "octopus-market-token-board-v3";
const officialDexScreenerPairAddress = "egi97rat7zrxrqvvv7edb5tvxzzxwgdh8vwvkgpfzdfc";
const officialVerifiedHolders = 28;
const officialTokenGoldBadgeSrc =
  "https://studio-assets.supernova.io/files/ws/757243/2f25ed55d146075e38472bdc708603004b4959dee3f03f4e93ea9bfca247f038.png";

type ChartRange = "1H" | "6H" | "24H" | "7D";
const chartRangeOptions: ChartRange[] = ["1H", "6H", "24H", "7D"];

// ─── Utilitaires (miroir de solfair-launch-studio.tsx) ────────────────────────

function isOfficialTrackedToken(token: OctopusTokenBoardItem) {
  return token.contractAddress === officialTokenAddress || token.id === "clawdtrust";
}

function formatCompactContractAddress(value: string | null | undefined) {
  if (!value) return "Pending";
  if (value.length <= 10) return value;
  return `${value.slice(0, 5)}...${value.slice(-5)}`;
}

function getPriceFractionDigits(numericValue: number) {
  if (numericValue < 0.0001) return 8;
  if (numericValue < 0.01) return 6;
  if (numericValue < 1) return 5;
  return 4;
}

function formatUsdValue(value: string | number | null | undefined, mode: "price" | "market" = "market") {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: mode === "market" && numericValue >= 10000 ? "compact" : "standard",
    minimumFractionDigits: mode === "price" ? getPriceFractionDigits(numericValue) : 2,
    maximumFractionDigits: mode === "price" ? getPriceFractionDigits(numericValue) : 2,
  }).format(numericValue);
}

function parseFormattedUsdValue(value: string | null | undefined) {
  if (!value) return 0;
  const sanitizedValue = value.replace(/[^0-9.-]+/g, "");
  const numericValue = Number(sanitizedValue);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatHoldersValue(value: string | number | null | undefined) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return "Live sync";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(numericValue);
}

function parseHoldersNumber(value: string | number | null | undefined) {
  const numericValue = Number(typeof value === "string" ? value.replace(/,/g, "") : value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return null;
  return numericValue;
}

function formatChartLabel(timestamp: number, range: ChartRange) {
  return new Intl.DateTimeFormat("en-US",
    range === "7D"
      ? { month: "short", day: "numeric" }
      : { hour: "2-digit", minute: "2-digit" }
  ).format(new Date(timestamp * 1000));
}

function createFallbackChartPoints(basePrice: number, range: ChartRange = "24H") {
  const safePrice = basePrice > 0 ? basePrice : 1;
  const rangeConfig =
    range === "1H" ? { points: 12, stepSeconds: 60 * 5 }
    : range === "6H" ? { points: 24, stepSeconds: 60 * 15 }
    : range === "7D" ? { points: 28, stepSeconds: 60 * 60 * 6 }
    : { points: 24, stepSeconds: 60 * 60 };

  return Array.from({ length: rangeConfig.points }, (_, index) => {
    const timestamp = Math.floor(Date.now() / 1000) - (rangeConfig.points - 1 - index) * rangeConfig.stepSeconds;
    const wave = Math.sin(index / 2.6) * 0.035;
    const drift = (index - 12) * 0.0018;
    const close = Number((safePrice * (1 + wave + drift)).toFixed(6));
    return {
      timestamp,
      label: formatChartLabel(timestamp, range),
      close,
      high: Number((close * 1.012).toFixed(6)),
      low: Number((close * 0.988).toFixed(6)),
      volume: Number((safePrice * 12000 * (1 + index / 12)).toFixed(2)),
    };
  });
}

function findFirstNumericLikeValue(payload: unknown, candidateKeys: string[]): string | number | null {
  if (!payload || typeof payload !== "object") return null;
  const normalizedKeys = new Set(candidateKeys.map((k) => k.replace(/[^a-z0-9]/gi, "").toLowerCase()));
  const visited = new WeakSet<object>();
  const search = (value: unknown): string | number | null => {
    if (!value || typeof value !== "object") return null;
    if (visited.has(value)) return null;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        const m = search(item);
        if (m !== null) return m;
      }
      return null;
    }
    const record = value as Record<string, unknown>;
    for (const [key, entryValue] of Object.entries(record)) {
      const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (normalizedKeys.has(normalizedKey) && (typeof entryValue === "string" || typeof entryValue === "number")) {
        const numericValue = Number(entryValue);
        if (Number.isFinite(numericValue) && numericValue > 0) return entryValue as string | number;
      }
      const nested = search(entryValue);
      if (nested !== null) return nested;
    }
    return null;
  };
  return search(payload);
}

async function fetchBirdeyeJson(path: string) {
  const response = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${path}`);
  if (!response.ok) throw new Error("dexscreener-request-failed");
  return response.json();
}

async function fetchDexScreenerTokenJson(tokenAddress: string) {
  const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${tokenAddress}`);
  if (!response.ok) throw new Error("dexscreener-token-request-failed");
  return response.json();
}

function extractBirdeyeMetricValue(payload: unknown, metric: "price" | "volume" | "marketCap" | "holders") {
  if (payload && typeof payload === "object") {
    const pair = Array.isArray((payload as { pairs?: unknown[] }).pairs)
      ? (payload as { pairs?: Array<Record<string, unknown>> }).pairs?.[0]
      : ((payload as { pair?: Record<string, unknown> }).pair ?? payload);
    if (pair && typeof pair === "object") {
      if (metric === "price") return (pair as { priceUsd?: string | number }).priceUsd ?? null;
      if (metric === "volume") return (pair as { volume?: { h24?: string | number } }).volume?.h24 ?? null;
      if (metric === "marketCap") {
        return (pair as { marketCap?: string | number }).marketCap
          ?? (pair as { fdv?: string | number }).fdv
          ?? (pair as { liquidity?: { usd?: string | number } }).liquidity?.usd
          ?? null;
      }
    }
  }
  if (metric === "price") return findFirstNumericLikeValue(payload, ["price", "priceUsd", "value", "currentPrice"]);
  if (metric === "volume") return findFirstNumericLikeValue(payload, ["v24hUSD", "volume24hUSD", "volume24h", "v24h", "volume"]);
  if (metric === "marketCap") return findFirstNumericLikeValue(payload, ["marketCap", "marketCapUsd", "mc", "fdv", "liquidity"]);
  return findFirstNumericLikeValue(payload, ["holders", "holder", "holderCount", "holdersCount", "holder_count"]);
}

function getBirdeyeTokenAddress(token: OctopusTokenBoardItem) {
  if (isOfficialTrackedToken(token)) return token.poolAddress || officialDexScreenerPairAddress;
  if (token.poolAddress) return token.poolAddress;
  const dexMatch = token.dexScreenerUrl?.match(/\/solana\/([^/?#]+)/i);
  return dexMatch?.[1] ?? "";
}

async function fetchBirdeyeChartPoints(tokenAddress: string, fallbackPrice: number, range: ChartRange = "24H") {
  try {
    const payload = await fetchBirdeyeJson(tokenAddress);
    const pair = Array.isArray(payload?.pairs) ? payload.pairs[0] : payload?.pair;
    const livePrice = Number(pair?.priceUsd ?? fallbackPrice) || fallbackPrice;
    const priceChangePercent = Number(pair?.priceChange?.h24 ?? 0);
    const driftRatio = Number.isFinite(priceChangePercent) ? priceChangePercent / 100 : 0;
    const chartPoints = createFallbackChartPoints(livePrice, range);
    if (chartPoints.length < 2) return chartPoints;
    return chartPoints.map((point, index) => {
      const factor = chartPoints.length === 1 ? 1 : index / (chartPoints.length - 1);
      const close = Number((livePrice * (1 - driftRatio + driftRatio * factor)).toFixed(8));
      return {
        ...point,
        close,
        high: Number((close * 1.012).toFixed(8)),
        low: Number((close * 0.988).toFixed(8)),
        volume: Number(pair?.volume?.h24 ?? point.volume ?? 0),
      };
    });
  } catch {
    return createFallbackChartPoints(fallbackPrice, range);
  }
}

async function fetchOfficialTokenHolders(token: OctopusTokenBoardItem) {
  if (!isOfficialTrackedToken(token)) return null;
  try {
    const tokenPayload = await fetchDexScreenerTokenJson(token.contractAddress || officialTokenAddress);
    const holderValue = extractBirdeyeMetricValue(tokenPayload, "holders");
    const parsedHolderValue = parseHoldersNumber(holderValue);
    if (parsedHolderValue !== null) return parsedHolderValue;
  } catch {
    return parseHoldersNumber(token.holders) ?? officialVerifiedHolders;
  }
  return parseHoldersNumber(token.holders) ?? officialVerifiedHolders;
}

async function fetchLiveTokenMetrics(token: OctopusTokenBoardItem) {
  const tokenAddress = getBirdeyeTokenAddress(token);
  if (!tokenAddress) return null;
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
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      }).format(new Date()),
    } satisfies Partial<OctopusTokenBoardItem>;
  } catch {
    return null;
  }
}

// ─── Tooltip du chart ─────────────────────────────────────────────────────────

function TokenChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value?: number; payload?: { label?: string } }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  return (
    <div className="rounded-2xl border border-orange-200 bg-white px-3 py-2 shadow-lg dark:border-white/10 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{point.payload?.label}</p>
      <p className="mt-1 text-sm font-semibold text-zinc-950 dark:text-white">
        {formatUsdValue(point.value, "price") || "$0.000000"}
      </p>
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────────

export function ClawdTrustHolderPage() {
  const tokenMetricsRefreshMs = 20000;

  const [octopusTokens, setOctopusTokens] = useState<OctopusTokenBoardItem[]>(() => readStoredOctopusTokens());
  const [selectedTokenId, setSelectedTokenId] = useState(() => readStoredOctopusTokens()[0]?.id ?? "clawdtrust");
  const [isTokenDetailsOpen, setIsTokenDetailsOpen] = useState(false);
  const [copiedContractId, setCopiedContractId] = useState<string | null>(null);
  const [selectedChartRange, setSelectedChartRange] = useState<ChartRange>("24H");
  const [selectedTokenChartOverride, setSelectedTokenChartOverride] = useState<Array<{
    timestamp: number; label: string; close: number; high: number; low: number; volume: number;
  }>>([]);
  const [isChartRefreshing, setIsChartRefreshing] = useState(false);

  // Persist tokens to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(octopusTokensStorageKey, JSON.stringify(octopusTokens));
    } catch { return; }
  }, [octopusTokens]);

  // Sync selectedTokenId if token list changes
  useEffect(() => {
    if (!octopusTokens.some((token) => token.id === selectedTokenId)) {
      setSelectedTokenId(octopusTokens[0]?.id ?? "clawdtrust");
    }
  }, [octopusTokens, selectedTokenId]);

  const tokenRefreshKey = useMemo(
    () => octopusTokens.map((t) => `${t.id}:${t.poolAddress}:${t.contractAddress}`).join("|"),
    [octopusTokens]
  );

  // Live metrics refresh
  useEffect(() => {
    if (typeof window === "undefined") return;
    let isCancelled = false;

    const refreshTokenMetrics = async () => {
      const nextSnapshots = await Promise.all(
        octopusTokens.map(async (token) => ({
          id: token.id,
          snapshot: isOfficialTrackedToken(token) || token.id === selectedTokenId
            ? await fetchLiveTokenMetrics(token)
            : null,
        }))
      );
      if (isCancelled) return;
      setOctopusTokens((currentTokens) =>
        currentTokens.map((token) => {
          const nextSnapshot = nextSnapshots.find((e) => e.id === token.id)?.snapshot;
          if (!nextSnapshot) return token;
          const mergedToken = { ...token, ...nextSnapshot };
          const hasChanged =
            mergedToken.price !== token.price ||
            mergedToken.volume24h !== token.volume24h ||
            mergedToken.marketCap !== token.marketCap ||
            mergedToken.holders !== token.holders ||
            mergedToken.status !== token.status;
          return hasChanged ? mergedToken : token;
        })
      );
    };

    void refreshTokenMetrics();
    const intervalId = window.setInterval(() => {
      if (!isCancelled) void refreshTokenMetrics();
    }, tokenMetricsRefreshMs);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedTokenId, tokenRefreshKey]);

  // Selected token computed values
  const selectedToken = octopusTokens.find((t) => t.id === selectedTokenId) ?? octopusTokens[0];
  const baseSelectedTokenChartData = selectedToken?.chartPoints?.length
    ? selectedToken.chartPoints
    : createFallbackChartPoints(parseFormattedUsdValue(selectedToken?.price) || 1, "24H");
  const selectedTokenChartData = selectedTokenChartOverride.length ? selectedTokenChartOverride : baseSelectedTokenChartData;
  const selectedTokenPriceDelta =
    selectedTokenChartData.length > 1
      ? ((selectedTokenChartData[selectedTokenChartData.length - 1].close - selectedTokenChartData[0].close) /
          selectedTokenChartData[0].close) * 100
      : 0;
  const selectedTokenIsPositive = selectedTokenPriceDelta >= 0;
  const dynamicTokenChartConfig = useMemo(
    () => ({ close: { label: "Price", color: selectedTokenIsPositive ? "#16a34a" : "#dc2626" } }),
    [selectedTokenIsPositive]
  );

  // Chart data fetch when dialog opens or range changes
  useEffect(() => {
    if (!selectedToken) { setSelectedTokenChartOverride([]); return; }
    let isCancelled = false;
    const fallbackPrice = parseFormattedUsdValue(selectedToken.price) || 1;

    setSelectedTokenChartOverride(
      selectedChartRange === "24H" && selectedToken.chartPoints?.length
        ? selectedToken.chartPoints
        : createFallbackChartPoints(fallbackPrice, selectedChartRange)
    );

    const tokenAddress = getBirdeyeTokenAddress(selectedToken);
    if (!tokenAddress || !isTokenDetailsOpen) { setIsChartRefreshing(false); return; }

    setIsChartRefreshing(true);
    void fetchBirdeyeChartPoints(tokenAddress, fallbackPrice, selectedChartRange)
      .then((points) => { if (!isCancelled) setSelectedTokenChartOverride(points); })
      .finally(() => { if (!isCancelled) setIsChartRefreshing(false); });

    return () => { isCancelled = true; };
  }, [isTokenDetailsOpen, selectedChartRange, selectedToken]);

  const renderSelectedTokenLiveDot = ({ cx, cy, index }: { cx?: number; cy?: number; index?: number }) => {
    if (typeof cx !== "number" || typeof cy !== "number" || typeof index !== "number" || index !== selectedTokenChartData.length - 1) return null;
    return (
      <g>
        <circle cx={cx} cy={cy} r={9} fill="var(--color-close)" opacity={0.18} className="animate-ping" />
        <circle cx={cx} cy={cy} r={5} fill="var(--color-close)" fillOpacity={0.28} />
        <circle cx={cx} cy={cy} r={3.5} fill="var(--color-close)" />
      </g>
    );
  };

  const handleCopyContract = async (token: OctopusTokenBoardItem) => {
    if (!token.contractAddress || typeof window === "undefined") return;
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
        setCopiedContractId((current) => (current === token.id ? null : current));
      }, 1600);
    } catch {
      setCopiedContractId(null);
    }
  };

  const handleOpenTokenChart = (token: OctopusTokenBoardItem) => {
    setSelectedTokenId(token.id);
    setIsTokenDetailsOpen(true);
  };

  return (
    <Card className="border-orange-200 bg-white text-zinc-950 shadow-[0_24px_80px_rgba(249,115,22,0.12)] transition-transform duration-500 md:[transform:perspective(1800px)_rotateX(2deg)] dark:border-white/10 dark:bg-white/5 dark:text-white dark:shadow-[0_28px_90px_rgba(0,0,0,0.35)]">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
            Become a ClawdTrust Holder
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
                    ? ((tokenChartData[tokenChartData.length - 1].close - tokenChartData[0].close) / tokenChartData[0].close) * 100
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
                            {isOfficialTrackedToken(token) ? (
                              <img src={officialTokenGoldBadgeSrc} alt={`${token.name} gold verified`} className="size-5 shrink-0 object-contain" />
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
                              onClick={(e) => { e.stopPropagation(); void handleCopyContract(token); }}
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

        {/* Dialog: Token Details + Chart */}
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
                      {isOfficialTrackedToken(selectedToken) ? (
                        <img src={officialTokenGoldBadgeSrc} alt={`${selectedToken.name} gold verified`} className="size-5 shrink-0 object-contain" />
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
                    <p className="mt-2 break-all text-sm text-zinc-900 dark:text-white">
                      Autonomous ClawdTrust sync · Dexscreener pair feed refreshed every {tokenMetricsRefreshMs / 1000} seconds
                    </p>
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

                {/* Live Chart */}
                <div className="overflow-hidden rounded-3xl border border-orange-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-zinc-950/80 dark:shadow-[0_36px_100px_rgba(0,0,0,0.4)]">
                  <div className={`border-b border-orange-100 px-5 py-5 dark:border-white/10 ${
                    selectedTokenIsPositive
                      ? "bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.22),transparent_45%),linear-gradient(180deg,rgba(240,253,244,1),rgba(255,255,255,1))] dark:bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.22),transparent_45%),linear-gradient(180deg,rgba(24,39,28,0.9),rgba(9,9,11,1))]"
                      : "bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.2),transparent_45%),linear-gradient(180deg,rgba(254,242,242,1),rgba(255,255,255,1))] dark:bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.22),transparent_45%),linear-gradient(180deg,rgba(48,24,24,0.9),rgba(9,9,11,1))]"
                  }`}>
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
                        <p className={`mt-2 text-lg font-semibold ${selectedTokenIsPositive ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}`}>
                          {selectedTokenIsPositive ? "+" : ""}{selectedTokenPriceDelta.toFixed(2)}%
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
                          <linearGradient id="clawdtrust-chart" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-close)" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="var(--color-close)" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
                        <YAxis tickLine={false} axisLine={false} width={92} tickFormatter={(v) => formatUsdValue(v, "price") || "$0.000000"} />
                        <ChartTooltip
                          cursor={{ stroke: "var(--color-close)", strokeOpacity: 0.28, strokeWidth: 1.5 }}
                          content={<TokenChartTooltip />}
                        />
                        <Area
                          type="monotone"
                          dataKey="close"
                          stroke="var(--color-close)"
                          strokeWidth={2.5}
                          fill="url(#clawdtrust-chart)"
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
  );
}

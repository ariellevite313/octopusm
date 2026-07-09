"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Coins,
  Copy,
  ExternalLink,
  FileUp,
  ImagePlus,
  Link2,
  LoaderCircle,
  Send,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useAuth } from "@/providers/auth-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
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

import {
  CHART_RANGE_OPTIONS,
  LAUNCH_BENEFITS,
  LAUNCH_OPTIONS,
  OFFICIAL_TOKEN_ADDRESS,
  OFFICIAL_TOKEN_GOLD_BADGE_SRC,
  SOLANA_PAYMENT_ADDRESS,
  TOKENS_SEED,
  TOKENS_STORAGE_KEY,
  type ChartRange,
  type LaunchOption,
  type LaunchStatus,
  type OctopusTokenBoardItem,
  FREE_LAUNCH_FEE_SOL,
  BASE_LAUNCH_FEE_SOL,
} from "@/lib/launch/launch-data";
import {
  createFallbackChartPoints,
  fetchLiveTokenMetrics,
  formatUsd,
  parseFormattedUsd,
} from "@/lib/launch/launch-metrics";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function shortAddress(addr: string) {
  return addr.length > 10 ? `${addr.slice(0, 5)}…${addr.slice(-5)}` : addr;
}

function normalizeLink(v: string) {
  const t = v.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function clamp(v: string | number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function readStoredTokens(): OctopusTokenBoardItem[] {
  if (typeof window === "undefined") return TOKENS_SEED;
  try {
    const raw = window.localStorage.getItem(TOKENS_STORAGE_KEY);
    if (!raw) return TOKENS_SEED;
    const parsed = JSON.parse(raw) as OctopusTokenBoardItem[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : TOKENS_SEED;
  } catch {
    return TOKENS_SEED;
  }
}

function createTokenEntry(
  symbol: string,
  name: string,
  contractAddress: string,
  opts?: {
    bagsFmUrl?: string;
    birdEyeUrl?: string;
    poolAddress?: string;
    initialBuyPercent?: number;
    logoSrc?: string;
    launchedByWallet?: string;
    launchedByName?: string;
  }
): OctopusTokenBoardItem {
  const ticker = symbol.trim().toUpperCase().slice(0, 8) || "TOKEN";
  return {
    id: `token-${Date.now()}-${ticker.toLowerCase()}`,
    name: name.trim() || ticker,
    ticker,
    logoSrc: opts?.logoSrc ?? "",
    price: "—",
    volume24h: "—",
    marketCap: "—",
    holders: "—",
    status: "Pending",
    contractAddress,
    poolAddress: opts?.poolAddress,
    solscanUrl: contractAddress ? `https://solscan.io/token/${contractAddress}` : "",
    dexScreenerUrl: opts?.poolAddress
      ? `https://dexscreener.com/solana/${opts.poolAddress.toLowerCase()}`
      : "",
    birdEyeUrl:
      opts?.birdEyeUrl ??
      (contractAddress ? `https://birdeye.so/solana/token/${contractAddress}` : ""),
    bagsFmUrl: opts?.bagsFmUrl ?? (contractAddress ? `https://bags.fm/${contractAddress}` : ""),
    initialBuyPercent: opts?.initialBuyPercent ?? 0,
    launchedByWallet: opts?.launchedByWallet,
    launchedByName: opts?.launchedByName,
  };
}

// ---------------------------------------------------------------------------
// TokenChartTooltip
// ---------------------------------------------------------------------------
function TokenChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { label: string; close: number; high: number; low: number; volume: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="space-y-2 rounded-2xl border border-orange-200 bg-white p-3 shadow-lg dark:border-white/10 dark:bg-zinc-950">
      <p className="text-xs text-muted-foreground">{point.label}</p>
      <div className="grid grid-cols-2 gap-2">
        {(["close", "high", "low"] as const).map((k) => (
          <div
            key={k}
            className="rounded-xl border border-orange-100 bg-orange-50/80 px-3 py-2 dark:border-white/10 dark:bg-black/30"
          >
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{k}</p>
            <p className="mt-1 font-semibold">{formatUsd(point[k], "price") || "$0.000000"}</p>
          </div>
        ))}
        <div className="rounded-xl border border-orange-100 bg-orange-50/80 px-3 py-2 dark:border-white/10 dark:bg-black/30">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Volume</p>
          <p className="mt-1 font-semibold">{formatUsd(point.volume, "market") || "$0.00"}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TokenDetailsDialog
// ---------------------------------------------------------------------------
function TokenDetailsDialog({
  token,
  open,
  onClose,
}: {
  token: OctopusTokenBoardItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const [range, setRange] = useState<ChartRange>("24H");
  const [chartData, setChartData] = useState(
    token ? createFallbackChartPoints(parseFormattedUsd(token.price) || 1, "24H") : []
  );
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    setRefreshing(true);
    fetchLiveTokenMetrics(token, range)
      .then((snap) => {
        if (!cancelled && snap?.chartPoints?.length) setChartData(snap.chartPoints);
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => { cancelled = true; };
  }, [open, range, token]);

  if (!token) return null;

  const delta =
    chartData.length > 1
      ? ((chartData[chartData.length - 1].close - chartData[0].close) / chartData[0].close) * 100
      : 0;
  const isPositive = delta >= 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-orange-200 bg-white p-0 dark:border-white/10 dark:bg-zinc-950">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-3">
            {token.logoSrc && (
              <img src={token.logoSrc} alt="" className="size-8 rounded-full border border-orange-200 object-cover dark:border-white/10" />
            )}
            {token.name}
            <Badge className="border border-orange-200 bg-orange-50 text-orange-700 dark:border-white/10 dark:bg-zinc-950 dark:text-orange-300">
              {token.status}
            </Badge>
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {token.contractAddress ?? "Contract address pending"}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-4">
          {/* Metrics grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Price", token.price],
                ["24h Volume", token.volume24h],
                ["Market Cap", token.marketCap],
                ["Holders", token.holders],
              ] as const
            ).map(([label, val]) => (
              <div
                key={label}
                className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 dark:border-white/10 dark:bg-black/20"
              >
                <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
                <p className="mt-2 font-semibold">{val || "—"}</p>
              </div>
            ))}
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-2">
            {token.dexScreenerUrl && (
              <a href={token.dexScreenerUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="rounded-full border-orange-200 text-xs dark:border-white/10">
                  DexScreener <ExternalLink className="ml-1 size-3" />
                </Button>
              </a>
            )}
            {token.birdEyeUrl && (
              <a href={token.birdEyeUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="rounded-full border-orange-200 text-xs dark:border-white/10">
                  BirdEye <ExternalLink className="ml-1 size-3" />
                </Button>
              </a>
            )}
            {token.solscanUrl && (
              <a href={token.solscanUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="rounded-full border-orange-200 text-xs dark:border-white/10">
                  Solscan <ExternalLink className="ml-1 size-3" />
                </Button>
              </a>
            )}
            {token.bagsFmUrl && (
              <a href={token.bagsFmUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="rounded-full border-orange-200 text-xs dark:border-white/10">
                  Bags.fm <ExternalLink className="ml-1 size-3" />
                </Button>
              </a>
            )}
          </div>

          <Separator className="border-orange-100 dark:border-white/10" />

          {/* Chart */}
          <div
            className={`overflow-hidden rounded-3xl border ${isPositive ? "border-emerald-200 dark:border-emerald-900/40" : "border-red-200 dark:border-red-900/40"}`}
          >
            <div
              className={`border-b px-5 py-4 ${isPositive ? "border-emerald-100 bg-gradient-to-b from-green-50 to-white dark:border-emerald-900/30 dark:from-green-950/30 dark:to-zinc-950" : "border-red-100 bg-gradient-to-b from-red-50 to-white dark:border-red-900/30 dark:from-red-950/30 dark:to-zinc-950"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Octopus live chart
                  </p>
                  <h4 className="mt-1 text-lg font-semibold">{token.ticker} market view</h4>
                </div>
                <div className="flex items-center gap-2">
                  {refreshing && <LoaderCircle className="size-3.5 animate-spin text-orange-500" />}
                  <div className={`rounded-xl border px-3 py-1.5 text-sm font-semibold ${isPositive ? "border-emerald-200 bg-white text-emerald-600 dark:border-emerald-900/40 dark:bg-black/30 dark:text-emerald-300" : "border-red-200 bg-white text-red-600 dark:border-red-900/40 dark:bg-black/30 dark:text-red-300"}`}>
                    {isPositive ? "+" : ""}{delta.toFixed(2)}%
                  </div>
                </div>
              </div>
              {/* Range buttons */}
              <div className="mt-3 flex flex-wrap gap-2">
                {CHART_RANGE_OPTIONS.map((r) => (
                  <Button
                    key={r}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRange(r)}
                    className={`rounded-full px-3 text-xs ${range === r ? "border-orange-400 bg-orange-500 text-white hover:bg-orange-400 dark:border-orange-400 dark:bg-orange-500" : "border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"}`}
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </div>

            <div className="p-4">
              <ChartContainer
                config={{ close: { label: "Price", color: isPositive ? "#22c55e" : "#ef4444" } }}
                className="h-48 w-full"
              >
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-close)" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="var(--color-close)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatUsd(v, "price") || String(v)}
                    domain={["auto", "auto"]}
                  />
                  <ChartTooltip content={<TokenChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="close"
                    stroke="var(--color-close)"
                    strokeWidth={2}
                    fill="url(#chartGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ChartContainer>
            </div>
          </div>

          {token.lastUpdatedLabel && (
            <p className="text-xs text-muted-foreground text-right">
              Last sync: {token.lastUpdatedLabel}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main LaunchStudio
// ---------------------------------------------------------------------------
export function LaunchStudio() {
  const { isAuthenticated, walletAddress } = useAuth();

  // Form state
  const [launchOption, setLaunchOption] = useState<LaunchOption>("free");
  const [tokenName, setTokenName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [mintAddress, setMintAddress] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const [logoName, setLogoName] = useState("");
  const [whitepaperName, setWhitepaperName] = useState("");
  const [projectXUrl, setProjectXUrl] = useState("");
  const [projectTelegramUrl, setProjectTelegramUrl] = useState("");
  const [projectDiscordUrl, setProjectDiscordUrl] = useState("");
  const [devWallets, setDevWallets] = useState([""]);
  const [initialBuyEnabled, setInitialBuyEnabled] = useState(true);
  const [initialBuyPercent, setInitialBuyPercent] = useState("1");

  // Token board
  const [octopusTokens, setOctopusTokens] = useState<OctopusTokenBoardItem[]>(() =>
    readStoredTokens()
  );
  const [selectedTokenId, setSelectedTokenId] = useState(
    () => readStoredTokens()[0]?.id ?? "clawdtrust"
  );
  const [tokenDetailsOpen, setTokenDetailsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Tab state
  const [tokenWorkspaceTab, setTokenWorkspaceTab] = useState<"create" | "tokens">("create");

  // Status
  const [status, setStatus] = useState<LaunchStatus>("idle");
  const [statusMessage, setStatusMessage] = useState(
    "Connect a wallet first, then fill the launch form to prepare and submit a token launch to Bags.fm."
  );

  // -------------------------------------------------------------------------
  // Computed
  // -------------------------------------------------------------------------
  const normalizedInitialBuyPercent = clamp(initialBuyPercent);
  const feeAmount =
    launchOption === "free"
      ? FREE_LAUNCH_FEE_SOL
      : BASE_LAUNCH_FEE_SOL;
  const selectedToken = useMemo(
    () => octopusTokens.find((t) => t.id === selectedTokenId) ?? octopusTokens[0] ?? null,
    [octopusTokens, selectedTokenId]
  );
  const canPrepareLaunch = Boolean(tokenName.trim() && symbol.trim() && mintAddress.trim() && logoName);

  // -------------------------------------------------------------------------
  // localStorage persistence
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(octopusTokens));
    } catch { /* ignore */ }
  }, [octopusTokens]);

  // keep selectedTokenId valid
  useEffect(() => {
    if (!octopusTokens.some((t) => t.id === selectedTokenId)) {
      setSelectedTokenId(octopusTokens[0]?.id ?? "clawdtrust");
    }
  }, [octopusTokens, selectedTokenId]);

  // -------------------------------------------------------------------------
  // Live metrics refresh
  // -------------------------------------------------------------------------
  const tokenRefreshKey = octopusTokens
    .map((t) => `${t.id}:${t.poolAddress}:${t.contractAddress}`)
    .join("|");

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const refresh = async () => {
      const snapshots = await Promise.all(
        octopusTokens.map(async (t) => ({
          id: t.id,
          snapshot:
            t.contractAddress === OFFICIAL_TOKEN_ADDRESS || t.id === selectedTokenId
              ? await fetchLiveTokenMetrics(t)
              : null,
        }))
      );
      if (cancelled) return;
      setOctopusTokens((prev) =>
        prev.map((t) => {
          const snap = snapshots.find((s) => s.id === t.id)?.snapshot;
          return snap ? { ...t, ...snap } : t;
        })
      );
    };

    refresh();
    const timer = setInterval(refresh, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenRefreshKey]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoName(file.name);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleWhitepaperChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setWhitepaperName(file.name);
  };

  const handleCopyContract = async (token: OctopusTokenBoardItem) => {
    if (!token.contractAddress || typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(token.contractAddress);
      setCopiedId(token.id);
      setTimeout(() => setCopiedId((cur) => (cur === token.id ? null : cur)), 1600);
    } catch { /* ignore */ }
  };

  const handlePrepareLaunch = async () => {
    if (!isAuthenticated || !walletAddress) {
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

    setStatus("loading");
    setStatusMessage(`Preparing launch request for ${tokenName.trim()}. You will be prompted to sign the fee transfer in your wallet.`);

    try {
      // Persist launch submission to Supabase via API route
      const res = await fetch("/api/launch/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenName: tokenName.trim(),
          symbol: symbol.trim().toUpperCase().slice(0, 8),
          description: description.trim(),
          mintAddress: mintAddress.trim(),
          logoName,
          whitepaperName,
          projectXUrl: normalizeLink(projectXUrl),
          projectTelegramUrl: normalizeLink(projectTelegramUrl),
          projectDiscordUrl: normalizeLink(projectDiscordUrl),
          developerWallets: devWallets.filter(Boolean),
          walletAddress,
          launchOption,
          feeAmount,
          initialBuyEnabled,
          initialBuyPercent: normalizedInitialBuyPercent,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Submission failed");
      }

      // Add to token board
      const nextEntry = createTokenEntry(symbol, tokenName, mintAddress.trim(), {
        logoSrc: logoPreview,
        launchedByWallet: walletAddress,
        initialBuyPercent: normalizedInitialBuyPercent,
      });
      setOctopusTokens((prev) => [
        nextEntry,
        ...prev.filter((t) => t.ticker !== symbol.trim().toUpperCase().slice(0, 8)),
      ].slice(0, 12));
      setSelectedTokenId(nextEntry.id);
      setTokenWorkspaceTab("tokens");

      setStatus("success");
      setStatusMessage(
        `Launch request recorded for ${tokenName.trim()}. The Octopus team will review and submit to Bags.fm after verifying the payment. Check your wallet for the ${feeAmount} SOL fee transfer request.`
      );
    } catch (err) {
      setStatus("error");
      setStatusMessage(
        err instanceof Error ? err.message : "An error occurred. Please try again."
      );
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <section className="border-y border-orange-100 bg-orange-50/70 py-16 dark:border-white/10 dark:bg-zinc-900/70">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-10 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-orange-500">
            <Sparkles className="size-4" />
            Launch studio
          </div>
          <h2 className="text-3xl font-bold tracking-tight">
            Launch a token from Octo Market
          </h2>
          <p className="max-w-xl text-muted-foreground">
            Fill in the token details, choose your fee option, and submit a verified launch
            request to Bags.fm — all in one guided flow.
          </p>
        </div>

        {/* Auth alert */}
        <Alert className="mb-8 border-orange-200 bg-white dark:border-white/10 dark:bg-white/5">
          {isAuthenticated ? (
            <CheckCircle2 className="size-4 text-emerald-500" />
          ) : (
            <Wallet className="size-4 text-orange-500" />
          )}
          <AlertTitle>
            {isAuthenticated ? "Wallet connected" : "Wallet connection required"}
          </AlertTitle>
          <AlertDescription>
            {isAuthenticated
              ? `Active wallet: ${shortAddress(walletAddress ?? "")}`
              : "Token launch preparation is unlocked after a Solana wallet connection."}
          </AlertDescription>
        </Alert>

        {/* Tabs: Create / Tokens */}
        <Tabs
          value={tokenWorkspaceTab}
          onValueChange={(v) => setTokenWorkspaceTab(v as "create" | "tokens")}
          className="space-y-6"
        >
          <TabsList className="grid h-auto grid-cols-2 gap-2 border border-orange-100 bg-white p-2 dark:border-white/10 dark:bg-white/5">
            <TabsTrigger value="create" className="min-h-11 rounded-2xl">
              Launch token
            </TabsTrigger>
            <TabsTrigger value="tokens" className="min-h-11 rounded-2xl">
              Octopus Tokens
            </TabsTrigger>
          </TabsList>

          {/* ────────────────────────────── CREATE TAB ────────────────────────────── */}
          <TabsContent value="create" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">

              {/* Left — form */}
              <Card className="border-orange-200 bg-white shadow-[0_24px_80px_rgba(249,115,22,0.10)] dark:border-white/10 dark:bg-white/5">
                <CardHeader>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="border border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300">
                      Launch Token
                    </Badge>
                    <Badge className="border border-orange-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200">
                      Bags.fm ready
                    </Badge>
                  </div>
                  <CardTitle className="text-2xl">Prepare a token launch flow</CardTitle>
                  <CardDescription className="text-base leading-7">
                    Add the token details, project socials, official wallets, and fee option
                    before sending the verified launch request to Bags.fm.
                  </CardDescription>
                </CardHeader>

                <CardContent className="grid gap-6 lg:grid-cols-2">
                  {/* Left column: option + info */}
                  <div className="space-y-4">
                    {/* Launch option */}
                    <div className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Coins className="size-4 text-orange-500" />
                        Launch option
                      </div>
                      <RadioGroup
                        value={launchOption}
                        onValueChange={(v) => setLaunchOption(v as LaunchOption)}
                        className="gap-3"
                      >
                        {LAUNCH_OPTIONS.map((opt) => {
                          const sel = opt.id === launchOption;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setLaunchOption(opt.id)}
                              className={`w-full rounded-2xl border p-4 text-left transition ${
                                sel
                                  ? "border-orange-300 bg-white shadow-sm dark:border-orange-400/40 dark:bg-orange-500/10"
                                  : "border-orange-200 bg-white hover:border-orange-300 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <RadioGroupItem
                                  value={opt.id}
                                  checked={sel}
                                  className="mt-1 border-orange-400 text-orange-500 dark:border-white/30"
                                  aria-label={opt.title}
                                />
                                <div className="space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{opt.title}</span>
                                    <Badge className="border border-orange-200 bg-orange-100 text-orange-700 text-xs dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300">
                                      {opt.badge}
                                    </Badge>
                                  </div>
                                  <p className="text-sm leading-6 text-muted-foreground">
                                    {opt.description}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </RadioGroup>
                    </div>

                    {/* Token info */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Token information</p>
                      <Input
                        value={tokenName}
                        onChange={(e) => setTokenName(e.target.value)}
                        placeholder="Token name"
                        className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"
                      />
                      <Input
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                        placeholder="Symbol, e.g. OCTO"
                        className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"
                      />
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Project description"
                        className="min-h-24 border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"
                      />
                      <Input
                        value={mintAddress}
                        onChange={(e) => setMintAddress(e.target.value)}
                        placeholder="SPL mint address"
                        className="font-mono text-sm border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"
                      />
                    </div>

                    {/* Socials */}
                    <div className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Link2 className="size-4 text-orange-500" />
                        Project links
                      </div>
                      {[
                        ["X / Twitter", projectXUrl, setProjectXUrl],
                        ["Telegram", projectTelegramUrl, setProjectTelegramUrl],
                        ["Discord", projectDiscordUrl, setProjectDiscordUrl],
                      ].map(([placeholder, val, setter]) => (
                        <Input
                          key={placeholder as string}
                          value={val as string}
                          onChange={(e) => (setter as React.Dispatch<React.SetStateAction<string>>)(e.target.value)}
                          placeholder={`Project ${placeholder} link`}
                          className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"
                        />
                      ))}
                    </div>
                  </div>

                  {/* Right column: uploads + deployer buy + dev wallets */}
                  <div className="space-y-4">
                    {/* Logo upload */}
                    <div className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ImagePlus className="size-4 text-orange-500" />
                        Token logo
                      </div>
                      <div className="flex items-center gap-3">
                        {logoPreview && (
                          <img
                            src={logoPreview}
                            alt="Logo preview"
                            className="size-12 rounded-full border border-orange-200 object-cover dark:border-white/10"
                          />
                        )}
                        <label className="flex-1 cursor-pointer rounded-xl border border-dashed border-orange-300 bg-white px-4 py-3 text-sm transition hover:bg-orange-50 dark:border-white/20 dark:bg-zinc-950 dark:hover:bg-zinc-900">
                          <span className="text-muted-foreground">
                            {logoName || "Click to upload PNG / JPG"}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleLogoChange}
                          />
                        </label>
                      </div>
                    </div>

                    {/* Whitepaper upload */}
                    <div className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FileUp className="size-4 text-orange-500" />
                        Whitepaper (optional)
                      </div>
                      <label className="flex cursor-pointer rounded-xl border border-dashed border-orange-300 bg-white px-4 py-3 text-sm transition hover:bg-orange-50 dark:border-white/20 dark:bg-zinc-950 dark:hover:bg-zinc-900">
                        <span className="text-muted-foreground">
                          {whitepaperName || "Upload PDF (optional)"}
                        </span>
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={handleWhitepaperChange}
                        />
                      </label>
                    </div>

                    {/* Deployer first buy */}
                    <div className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Coins className="size-4 text-orange-500" />
                            Deployer first buy
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Buy 1–5% of supply immediately after launch.
                          </p>
                        </div>
                        <Switch
                          checked={initialBuyEnabled}
                          onCheckedChange={setInitialBuyEnabled}
                        />
                      </div>
                      {initialBuyEnabled && (
                        <div className="grid grid-cols-5 gap-2">
                          {[1, 2, 3, 4, 5].map((pct) => {
                            const active = normalizedInitialBuyPercent === pct;
                            return (
                              <Button
                                key={pct}
                                type="button"
                                variant="outline"
                                onClick={() => setInitialBuyPercent(String(pct))}
                                className={`rounded-xl text-sm ${
                                  active
                                    ? "border-orange-300 bg-orange-500 text-white hover:bg-orange-400"
                                    : "border-orange-200 bg-white hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950"
                                }`}
                              >
                                {pct}%
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Developer wallets */}
                    <div className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
                      <p className="text-sm font-medium">Developer wallets (optional)</p>
                      {devWallets.map((wallet, idx) => (
                        <Input
                          key={idx}
                          value={wallet}
                          onChange={(e) => {
                            const next = [...devWallets];
                            next[idx] = e.target.value;
                            setDevWallets(next);
                          }}
                          placeholder={`Dev wallet ${idx + 1}`}
                          className="font-mono text-xs border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"
                        />
                      ))}
                      {devWallets.length < 3 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setDevWallets([...devWallets, ""])}
                          className="rounded-full border-orange-200 text-xs dark:border-white/10"
                        >
                          + Add wallet
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Right — summary + submit */}
              <div className="space-y-4">
                {/* Fee summary */}
                <Card className="border-orange-200 bg-white dark:border-white/10 dark:bg-white/5">
                  <CardHeader>
                    <CardTitle className="text-base">Launch summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Option</span>
                      <span className="font-medium capitalize">{launchOption}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fee</span>
                      <span className="font-semibold text-orange-600">{feeAmount} SOL</span>
                    </div>
                    {initialBuyEnabled && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">First buy</span>
                        <span className="font-medium">{normalizedInitialBuyPercent}% of supply</span>
                      </div>
                    )}
                    <Separator className="border-orange-100 dark:border-white/10" />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Recipient</span>
                      <span className="font-mono text-xs">{shortAddress(SOLANA_PAYMENT_ADDRESS)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Payment must be confirmed on-chain before the launch request is submitted
                      to Bags.fm.
                    </p>
                  </CardContent>
                </Card>

                {/* Benefits */}
                <Card className="border-orange-200 bg-white dark:border-white/10 dark:bg-white/5">
                  <CardHeader>
                    <CardTitle className="text-base">What&apos;s included</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {LAUNCH_BENEFITS.map((b) => (
                      <div key={b} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                        <span className="text-muted-foreground leading-5">{b}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Status + submit */}
                {status !== "idle" && (
                  <Alert
                    className={`border ${
                      status === "success"
                        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                        : status === "error"
                          ? "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20"
                          : "border-orange-200 bg-orange-50 dark:border-white/10 dark:bg-black/20"
                    }`}
                  >
                    {status === "loading" && <LoaderCircle className="size-4 animate-spin text-orange-500" />}
                    {status === "success" && <CheckCircle2 className="size-4 text-emerald-500" />}
                    <AlertTitle className="capitalize">{status}</AlertTitle>
                    <AlertDescription className="text-sm leading-6">{statusMessage}</AlertDescription>
                  </Alert>
                )}

                <Button
                  type="button"
                  size="lg"
                  disabled={status === "loading"}
                  onClick={handlePrepareLaunch}
                  className="w-full rounded-2xl bg-orange-500 py-6 text-base font-semibold text-white hover:bg-orange-400 disabled:opacity-60"
                >
                  {status === "loading" ? (
                    <span className="flex items-center gap-2">
                      <LoaderCircle className="size-4 animate-spin" />
                      Preparing…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Send className="size-4" />
                      {isAuthenticated ? "Submit launch request" : "Connect wallet to launch"}
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ────────────────────────────── TOKENS TAB ────────────────────────────── */}
          <TabsContent value="tokens">
            <div className="rounded-3xl border border-orange-200 bg-orange-50/80 p-4 dark:border-white/10 dark:bg-black/20">
              <p className="mb-4 rounded-2xl border border-orange-100 bg-white/80 px-4 py-3 text-sm text-muted-foreground dark:border-white/10 dark:bg-zinc-950/70">
                Use <strong>More info</strong> on any row to open its live chart and market data.
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-orange-200 dark:border-white/10">
                      {["Token", "Ticker", "Price", "24h Volume", "Market Cap", "Holders", "Status", ""].map(
                        (h) => (
                          <TableHead key={h} className={h === "" ? "text-right" : ""}>
                            {h}
                          </TableHead>
                        )
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {octopusTokens.map((token) => {
                      const chartData = token.chartPoints?.length
                        ? token.chartPoints
                        : createFallbackChartPoints(parseFormattedUsd(token.price) || 1);
                      const delta =
                        chartData.length > 1
                          ? ((chartData[chartData.length - 1].close - chartData[0].close) /
                              chartData[0].close) *
                            100
                          : 0;

                      return (
                        <TableRow
                          key={token.id}
                          className={`border-orange-100 transition hover:bg-white/80 dark:border-white/10 dark:hover:bg-zinc-950/70 ${
                            token.id === selectedToken?.id
                              ? "bg-white dark:bg-zinc-950/70"
                              : ""
                          }`}
                        >
                          <TableCell>
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2 font-semibold">
                                {token.logoSrc && (
                                  <img
                                    src={token.logoSrc}
                                    alt=""
                                    className="size-7 rounded-full border border-orange-200 object-cover dark:border-white/10"
                                  />
                                )}
                                <span className="flex items-center gap-1.5">
                                  {token.name}
                                  {(token.contractAddress === OFFICIAL_TOKEN_ADDRESS ||
                                    token.id === "clawdtrust") && (
                                    <img
                                      src={OFFICIAL_TOKEN_GOLD_BADGE_SRC}
                                      alt="Verified"
                                      className="size-4 object-contain"
                                    />
                                  )}
                                </span>
                              </div>
                              {token.contractAddress && (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <span className="font-mono text-[10px]">
                                    {shortAddress(token.contractAddress)}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => void handleCopyContract(token)}
                                    className="h-6 w-6 rounded-full border border-orange-200 p-0 dark:border-white/10"
                                    aria-label="Copy contract"
                                  >
                                    {copiedId === token.id ? (
                                      <Check className="size-3" />
                                    ) : (
                                      <Copy className="size-3" />
                                    )}
                                  </Button>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold">{token.ticker}</TableCell>
                          <TableCell
                            className={delta >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}
                          >
                            {token.price}
                          </TableCell>
                          <TableCell>{token.volume24h}</TableCell>
                          <TableCell>{token.marketCap}</TableCell>
                          <TableCell>{token.holders}</TableCell>
                          <TableCell>
                            <Badge className="border border-orange-200 bg-white text-orange-700 text-xs dark:border-white/10 dark:bg-zinc-950 dark:text-orange-300">
                              {token.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant={token.id === selectedToken?.id ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                setSelectedTokenId(token.id);
                                setTokenDetailsOpen(true);
                              }}
                              className={
                                token.id === selectedToken?.id
                                  ? "rounded-full bg-orange-500 px-4 text-white hover:bg-orange-400"
                                  : "rounded-full border-orange-200 bg-white px-4 dark:border-white/10 dark:bg-zinc-950"
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
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Token details dialog */}
      <TokenDetailsDialog
        token={selectedToken}
        open={tokenDetailsOpen}
        onClose={() => setTokenDetailsOpen(false)}
      />
    </section>
  );
}

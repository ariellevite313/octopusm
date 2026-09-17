"use client";

/**
 * TokenSwapArc — widget buy/sell pour les tokens Arc V4.
 *
 * Mode unique : Uniswap V4 via BondingCurveHook + BondingCurveRouter.
 * arc_launch_id === mint_address (token ERC-20 = son propre launch ID).
 */

import { useState, useEffect, useCallback } from "react";
import { createPublicClient, custom, http, encodeFunctionData, parseAbi } from "viem";
import { Loader2, CheckCircle2, ExternalLink, ArrowUpDown } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import {
  ARC_USDC_ADDRESS,
  ARC_HOOK_ADDRESS,
  ARC_ROUTER_ADDRESS,
  BONDING_CURVE_HOOK_ABI,
  BONDING_CURVE_ROUTER_ABI,
  ERC20_APPROVE_ABI,
  BC_GRAD_THRESHOLD,
  BC_VIRTUAL_USDC,
  BC_CURVE_SUPPLY,
  getArcV4PoolKey,
  getArcV4PoolId,
  quoteBuyV4,
  quoteSellV4,
} from "@/lib/arc-launchpad";
import { arc } from "@/lib/arc-chain";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  launchId:     string;  // arc_launch_id — égal à tokenAddress pour V4
  tokenAddress: string;  // mint_address (ERC-20 du token)
  ticker:       string;
  logoUrl?:     string;
};

type Direction = "buy" | "sell";

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Arc USDC natif = 18 decimals EVM, affiché en 6 decimals
function fmtUsdc(raw: bigint): string {
  return (Number(raw) / 1e18).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 6,
  });
}

function fmtTokens(raw: bigint, dec = 18): string {
  const n = Number(raw) / Math.pow(10, dec);
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/**
 * Convertit une string décimale en bigint sans perte de précision float64.
 */
function parseDecimalToBigInt(value: string, decimals: number): bigint {
  const [intStr, fracStr = ""] = value.split(".");
  const frac = fracStr.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(intStr || "0") * BigInt(10 ** decimals) + BigInt(frac || "0");
}

/** Affiche un bigint en string lisible pour l'input. */
function bigintToInputString(raw: bigint, decimals: number, maxFrac = 6): string {
  const divisor = BigInt(10 ** decimals);
  const intPart  = raw / divisor;
  const fracPart = raw % divisor;
  if (fracPart === 0n) return intPart.toString();
  const fracStr  = fracPart.toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  return fracStr ? `${intPart}.${fracStr}` : intPart.toString();
}

function openWalletModal() {
  window.dispatchEvent(new CustomEvent("open-wallet-connect"));
}

const ERC20_BALANCE_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
]);

// ─── Component ────────────────────────────────────────────────────────────────

export function TokenSwapArc({ launchId, tokenAddress, ticker, logoUrl }: Props) {
  const { walletAddress, selectedChain, isAuthenticated } = useAuth();

  // V4: arc_launch_id === mint_address
  const isV4 = launchId.toLowerCase() === tokenAddress.toLowerCase();

  const quoteAddress = ARC_USDC_ADDRESS as `0x${string}`;
  const quoteSymbol  = "USDC";

  const [direction,   setDirection]   = useState<Direction>("buy");
  const [amount,      setAmount]      = useState("");
  const [slippagePct, setSlippagePct] = useState(2);

  // Wallet connecté (MetaMask indépendamment de Supabase)
  const [mmAddress, setMmAddress] = useState<string | null>(null);

  // Balances
  const [quoteBalance, setQuoteBalance] = useState<bigint | null>(null);
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);

  // State on-chain
  const [graduated,     setGraduated]     = useState(false);
  const [lpAdded,       setLpAdded]       = useState(false);  // V4 only — LP ajouté après graduation
  const [progressBps,   setProgressBps]   = useState<bigint>(0n);
  const [gradThreshold, setGradThreshold] = useState<bigint>(0n);
  const [realRaised,    setRealRaised]    = useState<bigint>(0n);

  // Graduation tx (V4 — addGraduationLiquidity)
  const [graduating,      setGraduating]      = useState(false);
  const [graduateTxHash,  setGraduateTxHash]  = useState<string | null>(null);

  // V4 reserves (for client-side quotes — loaded via getCurveState)
  const [v4ReserveUsdc,   setV4ReserveUsdc]   = useState<bigint>(BC_VIRTUAL_USDC);
  const [v4ReserveTokens, setV4ReserveTokens] = useState<bigint>(BC_CURVE_SUPPLY);

  // Quote
  const [estimatedOut, setEstimatedOut] = useState<bigint | null>(null);

  // Tx
  const [swapping, setSwapping] = useState(false);
  const [txHash,   setTxHash]   = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  // ── Provider ──────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getEth(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    let eth = w.ethereum;
    if (Array.isArray(eth?.providers)) {
      eth = eth.providers.find(
        (p: { isMetaMask?: boolean; isPhantom?: boolean }) => p.isMetaMask && !p.isPhantom
      ) ?? eth;
    }
    if (!eth) throw new Error("MetaMask introuvable");
    return eth;
  }

  /**
   * Retourne l'adresse wallet active :
   *   1. Session Supabase (walletAddress) si disponible
   *   2. Sinon premier compte MetaMask/Rabby connecté (eth_accounts)
   */
  async function resolveActiveAddr(): Promise<`0x${string}` | null> {
    if (walletAddress) return walletAddress as `0x${string}`;
    try {
      const eth = getEth();
      const accounts: string[] = await eth.request({ method: "eth_accounts" });
      return accounts?.[0] ? (accounts[0] as `0x${string}`) : null;
    } catch { return null; }
  }

  /** Client lecture seule : HTTP public, pas besoin de MetaMask. */
  function getPublicClient() {
    return createPublicClient({
      chain: arc,
      transport: http("https://rpc.mainnet.arc.io"),
    });
  }

  // ── Load on-chain state ───────────────────────────────────────────────────

  const loadState = useCallback(async () => {
    if (!launchId) return;
    try {
      const client = getPublicClient();

      if (isV4) {
        // ── Uniswap V4 hook (singleton) ───────────────────────────────────────
        if (!ARC_HOOK_ADDRESS) return; // hook not yet deployed
        const poolId = getArcV4PoolId(tokenAddress as `0x${string}`);
        const state = await client.readContract({
          address: ARC_HOOK_ADDRESS,
          abi: BONDING_CURVE_HOOK_ABI,
          functionName: "getCurveState",
          args: [poolId],
        }) as {
          reserveUsdc:        bigint;
          reserveTokens:      bigint;
          realUsdcRaised:     bigint;
          graduated:          boolean;
          lpAdded:            boolean;
        };
        setGraduated(state.graduated);
        setLpAdded(state.lpAdded);
        setRealRaised(state.realUsdcRaised);
        setGradThreshold(BC_GRAD_THRESHOLD);
        setV4ReserveUsdc(state.reserveUsdc);
        setV4ReserveTokens(state.reserveTokens);
        const bps = state.graduated
          ? 10000n
          : (state.realUsdcRaised * 10000n / BC_GRAD_THRESHOLD);
        setProgressBps(bps);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchId, isV4, tokenAddress]);

  const loadBalances = useCallback(async () => {
    const addr = await resolveActiveAddr();
    if (!addr) { setQuoteBalance(null); setTokenBalance(null); return; }
    try {
      const client = getPublicClient();

      // USDC natif Arc (address(0)) → eth_getBalance (18 decimals EVM)
      const [quoteBal, tokBal] = await Promise.all([
        client.getBalance({ address: addr }),
        tokenAddress
          ? client.readContract({
              address: tokenAddress as `0x${string}`, abi: ERC20_BALANCE_ABI,
              functionName: "balanceOf", args: [addr],
            }) as Promise<bigint>
          : Promise.resolve(0n),
      ]);
      setQuoteBalance(quoteBal);
      setTokenBalance(tokBal);
    } catch { setQuoteBalance(null); setTokenBalance(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, tokenAddress]);

  // Détecter MetaMask indépendamment de Supabase
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = (window as any).ethereum;
    if (!eth) return;
    const sync = (accounts: string[]) => {
      setMmAddress(accounts[0] ?? null);
      if (accounts[0]) void loadBalances();
    };
    eth.request({ method: "eth_accounts" }).then((a: string[]) => sync(a)).catch(() => {});
    eth.on("accountsChanged", sync);
    return () => eth.removeListener("accountsChanged", sync);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void loadState(); }, [loadState]);
  useEffect(() => { void loadBalances(); }, [loadBalances]);

  // ── Quote ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setEstimatedOut(null); return; }

    // ── V4 : calcul client-side (reproduit la logique du hook, pas de RPC) ─
    try {
      if (direction === "buy") {
        // USDC natif 18 decimals
        const usdcGross = BigInt(Math.round(parsed * 1e18));
        const { tokensOut } = quoteBuyV4(v4ReserveUsdc, v4ReserveTokens, usdcGross);
        setEstimatedOut(tokensOut > 0n ? tokensOut : null);
      } else {
        const tokensIn = parseDecimalToBigInt(amount, 18);
        const { usdcOut } = quoteSellV4(v4ReserveUsdc, v4ReserveTokens, tokensIn);
        setEstimatedOut(usdcOut > 0n ? usdcOut : null);
      }
    } catch { setEstimatedOut(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, direction, launchId, v4ReserveUsdc, v4ReserveTokens]);

  // ── Ensure Arc Mainnet ───────────────────────────────────────────────────

  async function ensureArcChain(eth: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = eth as any;
    const chainHex = await e.request({ method: "eth_chainId" }) as string;
    if (parseInt(chainHex, 16) !== 5042) {
      await e.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x13B2" }],
      }).catch(async (err: { code?: number }) => {
        if (err?.code === 4902) {
          await e.request({ method: "wallet_addEthereumChain", params: [{
            chainId: "0x13B2", chainName: "Arc",
            nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
            rpcUrls: ["https://rpc.mainnet.arc.io"],
            blockExplorerUrls: ["https://explorer.arc.io"],
          }]});
        } else throw err;
      });
    }
  }

  // ── Wait receipt helper ───────────────────────────────────────────────────

  async function waitReceipt(hash: string) {
    const client = getPublicClient();
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const r = await client.getTransactionReceipt({ hash: hash as `0x${string}` }).catch(() => null);
      if (r) return r;
    }
    return null;
  }

  // ── Swap handler ──────────────────────────────────────────────────────────

  const handleSwap = async () => {
    const parsed = parseFloat(amount);
    if (!amount || !estimatedOut || !parsed || parsed <= 0) return;

    // Résoudre l'adresse active (Supabase ou MetaMask)
    const activeAddr = await resolveActiveAddr();
    if (!activeAddr) { setError("Connecte ton wallet pour swapper"); return; }

    setSwapping(true);
    setError(null);
    setTxHash(null);

    try {
      const eth = getEth();
      await ensureArcChain(eth);
      const client = getPublicClient();

      {
        // ── Uniswap V4 — BondingCurveRouter ───────────────────────────────────
        if (!ARC_ROUTER_ADDRESS) throw new Error("Contrats V4 pas encore déployés");

        const slipMul   = BigInt(Math.round((100 - slippagePct) * 10));
        const poolKey   = getArcV4PoolKey(tokenAddress as `0x${string}`);
        const usdcAddr  = ARC_USDC_ADDRESS as `0x${string}`;
        const memeAddr  = tokenAddress as `0x${string}`;
        // zeroForOne : true si currency0→currency1
        // buy  USDC→meme : zeroForOne = (USDC is currency0)
        // sell meme→USDC : zeroForOne = (meme is currency0) = !(USDC is currency0)
        const usdcIsC0  = usdcAddr.toLowerCase() < memeAddr.toLowerCase();

        if (direction === "buy") {
          // USDC natif Arc : 18 decimals EVM
          const quoteRaw  = BigInt(Math.round(parsed * 1e18));
          const minTokens = (estimatedOut * slipMul) / 1000n;
          const zeroForOne = usdcIsC0;

          if (quoteBalance !== null && quoteRaw > quoteBalance) throw new Error("Solde USDC insuffisant");

          // USDC natif → pas d'approval ERC-20, on envoie msg.value au router
          const swapData = encodeFunctionData({
            abi: BONDING_CURVE_ROUTER_ABI, functionName: "swap",
            args: [poolKey, zeroForOne, -quoteRaw, activeAddr, minTokens],
          });
          const hash = await eth.request({
            method: "eth_sendTransaction",
            params: [{ from: activeAddr, to: ARC_ROUTER_ADDRESS, data: swapData, value: `0x${quoteRaw.toString(16)}` }],
          }) as string;
          setTxHash(hash);
          await waitReceipt(hash);

        } else {
          // SELL meme → USDC
          const tokensIn   = parseDecimalToBigInt(amount, 18);
          const minQuote   = (estimatedOut * slipMul) / 1000n;
          const zeroForOne = !usdcIsC0;

          if (tokenBalance !== null && tokensIn > tokenBalance) throw new Error("Solde token insuffisant");

          // Approve meme → router
          const tokenAllowance = await client.readContract({
            address: memeAddr, abi: ERC20_BALANCE_ABI,
            functionName: "allowance",
            args: [activeAddr, ARC_ROUTER_ADDRESS],
          }) as bigint;
          if (tokenAllowance < tokensIn) {
            const approveData = encodeFunctionData({
              abi: ERC20_APPROVE_ABI, functionName: "approve",
              args: [ARC_ROUTER_ADDRESS, tokensIn * 2n],
            });
            const approveTx = await eth.request({
              method: "eth_sendTransaction",
              params: [{ from: activeAddr, to: memeAddr, data: approveData }],
            }) as string;
            await waitReceipt(approveTx);
          }

          // router.swap(poolKey, zeroForOne, -tokensIn, recipient, minUsdcOut)
          const swapData = encodeFunctionData({
            abi: BONDING_CURVE_ROUTER_ABI, functionName: "swap",
            args: [poolKey, zeroForOne, -tokensIn, activeAddr, minQuote],
          });
          const hash = await eth.request({
            method: "eth_sendTransaction",
            params: [{ from: activeAddr, to: ARC_ROUTER_ADDRESS, data: swapData }],
          }) as string;
          setTxHash(hash);
          await waitReceipt(hash);
        }
      }

      setAmount("");
      setEstimatedOut(null);
      // Refresh balances + bonding curve state — retry a few times in case the block isn't indexed yet
      [1500, 3000, 6000].forEach(ms => setTimeout(() => void loadBalances(), ms));
      [2000, 4000, 8000].forEach(ms => setTimeout(() => void loadState(),    ms));

    } catch (e) {
      const msg = e instanceof Error ? e.message : "Échec de la transaction";
      setError(
        msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("cancel")
          ? "Transaction annulée"
          : msg,
      );
    } finally {
      setSwapping(false);
    }
  };

  // ── Graduation handler (V4 — step 2 : add LP post-graduation) ───────────

  const handleGraduate = async () => {
    if (!isV4 || !ARC_HOOK_ADDRESS) return;
    const gradAddr = await resolveActiveAddr();
    if (!gradAddr) return;
    setGraduating(true);
    setError(null);
    setGraduateTxHash(null);
    try {
      const eth = getEth();
      await ensureArcChain(eth);
      const poolKey = getArcV4PoolKey(tokenAddress as `0x${string}`);
      const data = encodeFunctionData({
        abi: BONDING_CURVE_HOOK_ABI,
        functionName: "addGraduationLiquidity",
        args: [poolKey],
      });
      const hash = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: gradAddr, to: ARC_HOOK_ADDRESS, data }],
      }) as string;
      setGraduateTxHash(hash);
      await waitReceipt(hash);
      // Refresh state — LP is now added
      [1500, 3000].forEach(ms => setTimeout(() => void loadState(), ms));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Graduation failed";
      setError(
        msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("cancel")
          ? "Transaction cancelled"
          : msg,
      );
    } finally {
      setGraduating(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  // Arc tokens require an Arc (EVM) wallet
  if (isAuthenticated && selectedChain !== "arc") {
    return (
      <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center space-y-3">
        <p className="text-sm font-semibold text-foreground">Arc wallet required</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          This token runs on Arc (EVM).<br />
          Connect an EVM wallet (MetaMask, Rabby…) to trade.
        </p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 px-4 py-2 text-xs font-semibold text-indigo-400 hover:bg-indigo-500/20 transition-colors"
        >
          Switch wallet
        </button>
      </div>
    );
  }

  const inputBalance = direction === "buy" ? quoteBalance : tokenBalance;
  const inputSymbol  = direction === "buy" ? quoteSymbol  : ticker;
  const outputSymbol = direction === "buy" ? ticker       : quoteSymbol;

  const balFmt = inputBalance !== null
    ? `${direction === "buy" ? fmtUsdc(inputBalance) : fmtTokens(inputBalance)} ${inputSymbol}`
    : "—";

  const outFmt = estimatedOut && estimatedOut > 0n
    ? `~${direction === "buy" ? fmtTokens(estimatedOut) : fmtUsdc(estimatedOut)} ${outputSymbol}`
    : "";

  const canSwap = !!amount && parseFloat(amount) > 0 && !swapping && !graduated && !!estimatedOut;

  const progressPct = gradThreshold > 0n
    ? Math.min(100, Number((realRaised * 10000n) / gradThreshold) / 100)
    : 0;

  // Market cap calculé depuis la formule AMM constant-product :
  // mcap = (VIRTUAL_USDC + realRaised)² × totalSupply / (VIRTUAL_USDC × curveSupply)
  // Tout en 18 dec (natif Arc). Résultat divisé par 1e18 → USD.
  const VIRTUAL_USDC_N  = BC_VIRTUAL_USDC;            // 3_200n * 1e18
  const CURVE_SUPPLY_N  = BC_CURVE_SUPPLY;             // 800_000_000n * 1e18
  const TOTAL_SUPPLY_N  = 1_000_000_000n * 10n ** 18n; // 1 B tokens 18 dec
  const reserveUsdc     = VIRTUAL_USDC_N + realRaised;
  // Division intermédiaire pour éviter l'overflow bigint
  const currentMcapRaw  = reserveUsdc * reserveUsdc * TOTAL_SUPPLY_N / (VIRTUAL_USDC_N * CURVE_SUPPLY_N);
  const currentMcapUsdc = Number(currentMcapRaw) / 1e18; // 18 dec → USD
  const GRAD_MCAP_USDC  = 25_000; // constant — graduation toujours à ~$25K

  function fmtMcap(usd: number): string {
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000)     return `$${(usd / 1_000).toFixed(1)}K`;
    return `$${usd.toFixed(0)}`;
  }

  const QuoteBadge = () => (
    <div className="flex items-center gap-2 bg-black/5 dark:bg-white/10 rounded-full px-3 py-1.5">
      <div className="size-5 rounded-full bg-blue-400 flex items-center justify-center text-[8px] font-bold text-white">$</div>
      <span className="text-[13px] font-semibold text-foreground">{quoteSymbol}</span>
    </div>
  );

  const TokenBadge = () => (
    <div className="flex items-center gap-2 bg-black/5 dark:bg-white/10 rounded-full px-3 py-1.5">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={ticker} className="size-5 rounded-full object-cover" />
      ) : (
        <div className="size-5 rounded-full bg-blue-500/80 flex items-center justify-center text-[8px] font-bold text-white">
          {ticker.slice(0, 1)}
        </div>
      )}
      <span className="text-[13px] font-semibold text-foreground">{ticker}</span>
    </div>
  );

  const PayBadge  = () => direction === "buy" ? <QuoteBadge /> : <TokenBadge />;
  const RecvBadge = () => direction === "buy" ? <TokenBadge /> : <QuoteBadge />;

  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-card">
      <div className="p-4 space-y-2">

        {/* Graduated + LP déjà ajouté → pool active */}
        {graduated && lpAdded && (
          <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 text-center">
            <p className="text-xs font-semibold text-indigo-400">🎓 Graduated — trade on Uniswap V4</p>
          </div>
        )}

        {/* Graduated V4 but LP not yet added — prompt finalization */}
        {graduated && isV4 && !lpAdded && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-3 space-y-2">
            <p className="text-xs font-semibold text-amber-400 text-center">
              🎓 Graduation reached — pending finalization
            </p>
            <p className="text-[10px] text-amber-400/70 text-center leading-relaxed">
              The bonding curve is complete. Click below to add liquidity and activate the Uniswap V4 pool.
            </p>
            {graduateTxHash && (
              <a
                href={`https://explorer.arc.io/tx/${graduateTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-400 hover:underline"
              >
                <CheckCircle2 className="size-3.5" />
                TX submitted — ArcScan
                <ExternalLink className="size-3" />
              </a>
            )}
            <button
              onClick={() => void handleGraduate()}
              disabled={graduating}
              className="w-full rounded-full py-2.5 text-[13px] font-semibold bg-amber-500 hover:bg-amber-400 text-white transition-colors disabled:opacity-50"
            >
              {graduating ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="size-3.5 animate-spin" />
                  Finalizing…
                </span>
              ) : "Finalize graduation"}
            </button>
          </div>
        )}

        {/* Buy / Sell tabs */}
        {!graduated && (
          <div className="flex rounded-xl overflow-hidden border border-border">
            {(["buy", "sell"] as Direction[]).map(d => (
              <button
                key={d}
                onClick={() => { setDirection(d); setAmount(""); setEstimatedOut(null); }}
                className={`flex-1 py-2.5 text-[13px] font-semibold transition-colors capitalize ${
                  direction === d
                    ? d === "buy"
                      ? "bg-emerald-500 text-white"
                      : "bg-red-500 text-white"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        )}

        {/* Bonding curve progress */}
        {!graduated && gradThreshold > 0n && (
          <div className="space-y-1 px-0.5">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Bonding curve</span>
              <span>MC {fmtMcap(currentMcapUsdc)} / {fmtMcap(GRAD_MCAP_USDC)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all bg-blue-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-right">
              {progressBps > 0n ? `${(Number(progressBps) / 100).toFixed(1)}%` : "0%"} to graduation
            </p>
          </div>
        )}

        {/* Pay */}
        <div className="rounded-2xl bg-muted/40 px-4 py-3.5 space-y-1">
          <p className="text-[12px] text-muted-foreground font-medium">You pay</p>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            disabled={graduated || swapping}
            className="w-full bg-transparent text-[28px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/30 disabled:opacity-50"
          />
          <div className="flex items-center justify-between mt-1">
            <PayBadge />
            <span className="text-[11px] text-muted-foreground/60">
              {(walletAddress || mmAddress) ? `Balance: ${balFmt}` : "—"}
            </span>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex justify-center -my-0.5">
          <div className="size-7 rounded-full bg-muted flex items-center justify-center">
            <ArrowUpDown className="size-3.5 text-muted-foreground" />
          </div>
        </div>

        {/* Receive */}
        <div className="rounded-2xl bg-muted/40 px-4 py-3.5 space-y-1">
          <p className="text-[12px] text-muted-foreground font-medium">You receive</p>
          <div className="min-h-[40px] flex items-center">
            {outFmt ? (
              <span className="text-[28px] font-semibold text-foreground">{outFmt}</span>
            ) : (
              <span className="text-[28px] font-semibold text-muted-foreground/30">0</span>
            )}
          </div>
          <div className="flex items-center justify-between mt-1">
            <RecvBadge />
            <span className="text-[11px] text-muted-foreground/60">estimated</span>
          </div>
        </div>

        {/* % shortcuts */}
        {!graduated && (
          <div className="flex gap-2 pt-1">
            {[25, 50, 75, 100].map(pct => (
              <button
                key={pct}
                onClick={() => {
                  if (!inputBalance) return;
                  const portion  = (inputBalance * BigInt(pct)) / 100n;
                  // Arc : USDC natif ET tokens sont tous les deux en 18 décimales
                  setAmount(bigintToInputString(portion, 18, direction === "buy" ? 2 : 4));
                }}
                className="flex-1 py-2 rounded-full text-[12px] font-semibold border bg-muted/40 border-border text-muted-foreground hover:border-border-strong hover:text-foreground transition-colors"
              >
                {pct}%
              </button>
            ))}
          </div>
        )}

        {/* Slippage */}
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-[12px] text-muted-foreground">Slippage</span>
          <div className="flex gap-1.5">
            {[1, 2, 5].map(s => (
              <button
                key={s}
                onClick={() => setSlippagePct(s)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  slippagePct === s
                    ? "bg-blue-500 border-blue-500 text-white"
                    : "bg-muted/40 border-border text-muted-foreground"
                }`}
              >
                {s}%
              </button>
            ))}
          </div>
        </div>

        {/* Fee breakdown */}
        {amount && parseFloat(amount) > 0 && direction === "buy" && (
          <div className="flex items-center justify-between px-1 pt-0.5">
            <span className="text-[11px] text-muted-foreground">Fee (2%)</span>
            <span className="text-[11px] text-muted-foreground">
              ~{(parseFloat(amount) * 0.02).toFixed(4)} {quoteSymbol}
              <span className="opacity-50 ml-1">(1% creator · 1% platform)</span>
            </span>
          </div>
        )}

        {error && <p className="text-[11px] text-red-400 text-center">{error}</p>}

        {txHash && (
          <a
            href={`https://explorer.arc.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-400 hover:underline"
          >
            <CheckCircle2 className="size-3.5" />
            Confirmé — ArcScan
            <ExternalLink className="size-3" />
          </a>
        )}

        {/* Bouton visible dès que MetaMask OU Supabase est connecté */}
        {!isAuthenticated && !mmAddress ? (
          <button
            onClick={openWalletModal}
            className="w-full rounded-md py-2.5 text-[15px] font-semibold bg-orange-500 hover:bg-orange-400 text-white transition-colors mt-1"
          >
            Connect wallet
          </button>
        ) : (
          <button
            onClick={() => void handleSwap()}
            disabled={!canSwap}
            className={`w-full rounded-md py-4 text-[15px] font-semibold transition-colors mt-1 ${
              !canSwap
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : direction === "sell"
                  ? "bg-red-500 hover:bg-red-400 text-white"
                  : "bg-orange-500 hover:bg-orange-400 text-white"
            }`}
          >
            {swapping ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                {direction === "buy" ? "Buying…" : "Selling…"}
              </span>
            ) : graduated
              ? "Graduated"
              : direction === "buy"
                ? `Buy $${ticker}`
                : `Sell $${ticker}`}
          </button>
        )}

        <p className="text-center text-[10px] text-muted-foreground/40 pb-1">
          Arc Network · Uniswap V4 Hook
        </p>
      </div>
    </div>
  );
}

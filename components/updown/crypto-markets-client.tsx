"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Clock, Zap } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { connectWalletAndAuth } from "@/lib/wallet/auth";
import { getAvailableWallets } from "@/lib/wallet/adapters";
import { WalletSelectDialog } from "@/components/wallet/wallet-select-dialog";
import { TREASURY_ADDRESS, USDC_MINT } from "@/lib/market/betting";
import type { WalletType } from "@/lib/wallet/adapters";

// ── Types ─────────────────────────────────────────────────────────────────────

type Symbol = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
type Direction = "up" | "down";

interface UpDownMarket {
  id: string;
  symbol: Symbol;
  duration_min: number;
  strike_price: number;
  open_price: number | null;
  opens_at: string;
  closes_at: string;
  resolve_at: string | null;
  status: "open" | "resolved" | "cancelled";
  outcome: Direction | null;
  pool_up: number;
  pool_down: number;
  fee_rate: number;
}

interface UpDownBet {
  id: string;
  market_id: string;
  direction: Direction;
  amount: number;
  payout: number | null;
  status: string;
}

// ── Helpers timing ───────────────────────────────────────────────────────────

const BETTING_MINUTES: Record<number, number> = { 5: 5, 15: 15, 30: 30 };

// BUG-UD-2 FIX: closes_at en DB = opens_at + betting_min, toujours défini.
// On l'utilise directement — le fallback par calcul était trompeur.
function getBettingClosesAt(market: UpDownMarket): string {
  return market.closes_at;
}

function getResolveAt(market: UpDownMarket): string {
  return market.resolve_at
    ?? new Date(new Date(market.opens_at).getTime() + market.duration_min * 2 * 60_000).toISOString();
}

// ── Config ────────────────────────────────────────────────────────────────────

const SYMBOLS: { value: Symbol; label: string; color: string }[] = [
  { value: "BTCUSDT", label: "Bitcoin",  color: "#f59e0b" },
  { value: "ETHUSDT", label: "Ethereum", color: "#3b82f6" },
  { value: "SOLUSDT", label: "Solana",   color: "#9333ea" },
];

const DURATIONS = [5, 15, 30];
const QUICK_AMOUNTS = [2, 5, 10, 25];
const MIN_AMOUNT = 2;
const MAX_AMOUNT = 50;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function formatPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return p.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 4 });
}

function useCountdown(closeAt: string | null | undefined): string {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!closeAt) { setRemaining(""); return; }
    const target = new Date(closeAt).getTime();
    const tick = () => {
      const diff = target - Date.now();
      // UX-UD-1 FIX: afficher "00:00" plutôt que "" pour éviter le saut visuel
      if (diff <= 0) { setRemaining("00:00"); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [closeAt]);
  return remaining;
}

// ── RoundCard ─────────────────────────────────────────────────────────────────

function RoundCard({
  market, myBets, onBetPlaced, walletAddress, walletType, onNeedWallet,
}: {
  market: UpDownMarket;
  myBets: UpDownBet[];
  onBetPlaced: () => void;
  walletAddress: string | null;
  walletType: WalletType | null;
  onNeedWallet: () => void;
}) {
  const bettingClosesAt = getBettingClosesAt(market);
  const resolveAt = getResolveAt(market);

  // Prochain opens_at = resolveAt + pause (5min pour 5m, 15min pour 15m, 30min pour 30m)
  // = resolve_at + betting_minutes (même durée que la phase betting)
  const pauseMs = (BETTING_MINUTES[market.duration_min] ?? market.duration_min) * 60_000;
  const nextOpensAt = new Date(new Date(resolveAt).getTime() + pauseMs).toISOString();

  const [isBettingOpen, setIsBettingOpen] = useState(
    () => market.status === "open" && new Date(bettingClosesAt) > new Date()
  );
  useEffect(() => {
    if (market.status !== "open") { setIsBettingOpen(false); return; }
    const ms = new Date(bettingClosesAt).getTime() - Date.now();
    if (ms <= 0) { setIsBettingOpen(false); return; }
    setIsBettingOpen(true);
    const id = setTimeout(() => setIsBettingOpen(false), ms);
    return () => clearTimeout(id);
  }, [bettingClosesAt, market.status]);

  const isLive = market.status === "open" && !isBettingOpen;
  const isResolvingPause = market.status === "resolved";
  const countdown = useCountdown(isBettingOpen ? bettingClosesAt : null);
  const liveCountdown = useCountdown(isLive ? resolveAt : null);
  const nextRoundCountdown = useCountdown(isResolvingPause ? nextOpensAt : null);

  const [amount, setAmount] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [activeDir, setActiveDir] = useState<Direction | null>(null);

  const poolUp   = Number(market.pool_up);
  const poolDown = Number(market.pool_down);
  const total    = poolUp + poolDown;
  const upPct    = total > 0 ? Math.round((poolUp / total) * 100) : 50;
  const downPct  = 100 - upPct;

  const isResolved = market.status === "resolved";
  const myBet = myBets.find(b => b.market_id === market.id);

  const estPayout = (dir: Direction) => {
    const win  = dir === "up" ? poolUp  : poolDown;
    const lose = dir === "up" ? poolDown : poolUp;
    if (win === 0) return amount * 1.9;
    return (amount / (win + amount)) * ((win + amount + lose) * (1 - Number(market.fee_rate) / 100));
  };

  const handleBet = async (dir: Direction) => {
    if (!walletAddress || !walletType) { onNeedWallet(); return; }
    if (amount < MIN_AMOUNT) {
      toast.error(`Minimum $${MIN_AMOUNT} USDC`);
      return;
    }
    setSubmitting(true);
    setActiveDir(dir);
    try {
      const web3 = await import("@solana/web3.js");
      const { Connection, PublicKey, Transaction, TransactionInstruction } = web3;
      const adapters = await import("@/lib/wallet/adapters");
      let provider = adapters.getProviderByType(walletType);
      if (!provider && typeof window !== "undefined") {
        const w = window as any;
        if (w.solana?.signAndSendTransaction || w.solana?.signTransaction) provider = w.solana;
      }
      if (!provider) { toast.error("Wallet not found"); return; }

      const TOKEN_PROGRAM    = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
      const ASSOC_TOKEN_PROG = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
      const MEMO_PROGRAM     = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
      const amountBase = Math.round(amount * 1_000_000);

      const payerPK     = new PublicKey(walletAddress);
      const recipientPK = new PublicKey(TREASURY_ADDRESS);
      const mintPK      = new PublicKey(USDC_MINT);
      const payerATA    = PublicKey.findProgramAddressSync(
        [payerPK.toBuffer(), new PublicKey(TOKEN_PROGRAM).toBuffer(), mintPK.toBuffer()],
        new PublicKey(ASSOC_TOKEN_PROG)
      )[0];
      const recipATA = PublicKey.findProgramAddressSync(
        [recipientPK.toBuffer(), new PublicKey(TOKEN_PROGRAM).toBuffer(), mintPK.toBuffer()],
        new PublicKey(ASSOC_TOKEN_PROG)
      )[0];
      const memo = `updown?market=${market.id}&dir=${dir}&wallet=${walletAddress}`;

      const RPCS = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com", "https://rpc.ankr.com/solana"];
      let signature = "";
      for (const rpc of RPCS) {
        try {
          const conn = new Connection(rpc, "confirmed");
          const { blockhash } = await conn.getLatestBlockhash("confirmed");
          const tx = new Transaction({ feePayer: payerPK, recentBlockhash: blockhash });

          const ataInfo = await conn.getAccountInfo(recipATA, "confirmed");
          if (!ataInfo) {
            tx.add(new TransactionInstruction({
              programId: new PublicKey(ASSOC_TOKEN_PROG),
              keys: [
                { pubkey: payerPK,                      isSigner: true,  isWritable: true  },
                { pubkey: recipATA,                     isSigner: false, isWritable: true  },
                { pubkey: recipientPK,                  isSigner: false, isWritable: false },
                { pubkey: mintPK,                       isSigner: false, isWritable: false },
                { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: new PublicKey(TOKEN_PROGRAM), isSigner: false, isWritable: false },
              ],
              data: Buffer.from([1]),
            }));
          }
          tx.add(new TransactionInstruction({
            programId: new PublicKey(MEMO_PROGRAM),
            keys: [{ pubkey: payerPK, isSigner: true, isWritable: false }],
            data: Buffer.from(memo, "utf8"),
          }));
          const txData = Buffer.alloc(10);
          txData[0] = 12;
          let v = amountBase;
          for (let i = 0; i < 8; i++) { txData[1 + i] = v & 0xff; v = Math.floor(v / 256); }
          txData[9] = 6;
          tx.add(new TransactionInstruction({
            programId: new PublicKey(TOKEN_PROGRAM),
            keys: [
              { pubkey: payerATA,  isSigner: false, isWritable: true  },
              { pubkey: mintPK,    isSigner: false, isWritable: false },
              { pubkey: recipATA,  isSigner: false, isWritable: true  },
              { pubkey: payerPK,   isSigner: true,  isWritable: false },
            ],
            data: txData,
          }));

          if (provider.signAndSendTransaction) {
            const res = await provider.signAndSendTransaction(tx, { maxRetries: 3, preflightCommitment: "confirmed" });
            signature = res.signature;
          } else {
            const signed = await provider.signTransaction!(tx);
            signature = await conn.sendRawTransaction((signed as any).serialize(), { maxRetries: 3 });
          }
          break;
        } catch { /* try next RPC */ }
      }

      if (!signature) { toast.error("Transaction failed"); return; }

      const res = await fetch("/api/updown/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market_id: market.id, wallet_address: walletAddress, direction: dir, amount, tx_signature: signature }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        toast.error(err.error ?? "Erreur serveur");
        return;
      }
      toast.success(`${dir.toUpperCase()} predict placed!`);
      onBetPlaced();
    } catch (e: any) {
      const msg = (e?.message ?? "").toLowerCase();
      if (msg.includes("cancel") || msg.includes("reject")) toast.error("Transaction cancelled");
      else toast.error("Error: " + (e?.message ?? ""));
    } finally {
      setSubmitting(false);
      setActiveDir(null);
    }
  };

  return (
    <div className={`rounded-2xl border bg-card overflow-hidden ${isResolved ? "border-border/50 opacity-90" : "border-border"}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Clock className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">{market.duration_min} minutes</span>
        </div>
        {isBettingOpen && countdown && (
          <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold tabular-nums text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
            {countdown}
          </span>
        )}
        {isLive && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
            LIVE
          </span>
        )}
        {isResolved && market.outcome && (
          <div className="flex flex-col items-end gap-0.5">
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
              market.outcome === "up"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
            }`}>
              {market.outcome === "up" ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {market.outcome === "up" ? "UP" : "DOWN"}
            </span>
            {nextRoundCountdown && (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                Next round in <span className="font-semibold text-foreground">{nextRoundCountdown}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Strike / close */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Strike</p>
          <p className="text-base font-bold tabular-nums text-foreground">${formatPrice(market.strike_price)}</p>
        </div>
        {isResolved && market.open_price && (
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Close</p>
            <p className={`text-base font-bold tabular-nums ${Number(market.open_price) > market.strike_price ? "text-emerald-500" : "text-red-500"}`}>
              ${formatPrice(Number(market.open_price))}
            </p>
          </div>
        )}
      </div>

      {/* Pool bar */}
      <div className="px-4 pb-3">
        <div className="flex text-[10px] font-semibold mb-1 justify-between">
          <span className="text-emerald-600 dark:text-emerald-400">↑ UP {upPct}% (${poolUp.toFixed(0)})</span>
          <span className="text-red-600 dark:text-red-400">DOWN {downPct}% (${poolDown.toFixed(0)}) ↓</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden flex">
          <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${upPct}%` }} />
          <div className="bg-red-500 flex-1" />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 text-center">
          Pool: ${total.toFixed(2)} USDC · Fee {market.fee_rate}%
        </p>
      </div>

      {/* My bet */}
      {myBet && (
        <div className={`mx-4 mb-3 rounded-xl px-3 py-2 text-xs flex items-center justify-between ${
          myBet.status === "won"     ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400" :
          myBet.status === "lost"    ? "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400" :
          myBet.status === "claimed" ? "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400" :
          myBet.status === "paid"    ? "bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400" :
          "bg-muted text-muted-foreground"
        }`}>
          <span>
            My predict: <strong>${myBet.amount} {myBet.direction === "up" ? "↑ UP" : "↓ DOWN"}</strong>
            {myBet.payout && myBet.status !== "lost" ? ` → $${myBet.payout.toFixed(2)}` : ""}
          </span>
          {(myBet.status === "won" || myBet.status === "refunded") && <span className="text-[10px] font-semibold text-emerald-600">🏆 Claim in dashboard</span>}
          {myBet.status === "claimed" && <span className="text-[10px]">⏳ Pending</span>}
          {myBet.status === "paid"    && <span className="text-[10px]">✅ Paid</span>}
        </div>
      )}

      {/* Bet controls */}
      {isBettingOpen && !myBet && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex gap-2">
            {QUICK_AMOUNTS.map(q => (
              <button key={q} onClick={() => setAmount(q)}
                className={`flex-1 rounded-lg border py-1 text-xs font-semibold transition-colors ${
                  amount === q ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >${q}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
            <span className="text-xs text-muted-foreground">$</span>
            <input type="number" min={MIN_AMOUNT} value={amount}
              onChange={e => setAmount(Math.max(MIN_AMOUNT, Number(e.target.value)))}
              className="flex-1 bg-transparent text-sm font-semibold text-foreground outline-none"
            />
            <span className="text-[10px] text-muted-foreground">USDC</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button disabled={submitting} onClick={() => handleBet("up")}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
            >
              {submitting && activeDir === "up" ? "..." : <><TrendingUp className="size-4" /> UP ~${estPayout("up").toFixed(2)}</>}
            </button>
            <button disabled={submitting} onClick={() => handleBet("down")}
              className="flex items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              {submitting && activeDir === "down" ? "..." : <><TrendingDown className="size-4" /> DOWN ~${estPayout("down").toFixed(2)}</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function CryptoMarketsClient() {
  const { walletAddress, walletType } = useAuth();
  const [activeSymbol, setActiveSymbol] = useState<Symbol>("BTCUSDT");
  const [markets, setMarkets] = useState<Record<number, { open?: UpDownMarket; resolved?: UpDownMarket }>>({});
  const [myBets, setMyBets] = useState<UpDownBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWalletDialog, setShowWalletDialog] = useState(false);
  const supabase = useRef(getSupabase());
  const channelRef = useRef<any>(null);

  const fetchMarkets = useCallback(async () => {
    const res = await fetch(`/api/updown/markets?symbol=${activeSymbol}`);
    if (res.ok) {
      const d = await res.json() as { markets: Record<string, { open?: UpDownMarket; resolved?: UpDownMarket }> };
      // Normalise string keys → number keys
      const normalized: Record<number, { open?: UpDownMarket; resolved?: UpDownMarket }> = {};
      for (const [k, v] of Object.entries(d.markets ?? {})) normalized[Number(k)] = v;
      setMarkets(normalized);
    }
    setLoading(false);
  }, [activeSymbol]);

  const fetchMyBets = useCallback(async () => {
    if (!walletAddress) return;
    const { data } = await supabase.current
      .from("updown_bets")
      .select("id, market_id, direction, amount, payout, status")
      .eq("wallet_address", walletAddress)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setMyBets(data as UpDownBet[]);
  }, [walletAddress]);

  useEffect(() => {
    setLoading(true);
    void fetchMarkets();
    void fetchMyBets();
  }, [activeSymbol, fetchMarkets, fetchMyBets]);

  useEffect(() => {
    const sb = supabase.current;
    if (channelRef.current) void sb.removeChannel(channelRef.current);
    const ch = sb
      .channel(`updown-${activeSymbol}`)
      .on("postgres_changes" as const, {
        event: "*", schema: "public", table: "updown_markets",
        filter: `symbol=eq.${activeSymbol}`,
      }, () => { void fetchMarkets(); })
      .subscribe();
    channelRef.current = ch;
    return () => { void sb.removeChannel(ch); };
  }, [activeSymbol, fetchMarkets]);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/60 bg-card/60 px-4 py-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="size-5 text-amber-500" />
            <h1 className="text-lg font-bold text-foreground">Crypto Up/Down</h1>
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">LIVE</span>
          </div>
          <div className="flex gap-2">
            {SYMBOLS.map(s => (
              <button key={s.value} onClick={() => setActiveSymbol(s.value)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                  activeSymbol === s.value ? "text-white shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
                style={activeSymbol === s.value ? { background: s.color } : undefined}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <span className="text-sm text-muted-foreground animate-pulse">Loading rounds...</span>
          </div>
        ) : Object.keys(markets).length === 0 ? (
          <div className="flex h-40 items-center justify-center flex-col gap-2">
            <p className="text-sm text-muted-foreground">No active rounds at the moment.</p>
            <p className="text-xs text-muted-foreground">Rounds are created automatically every minute.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {DURATIONS.map(d => {
              const slot = markets[d];
              const market = slot?.open ?? slot?.resolved;
              if (!market) return (
                <div key={d} className="rounded-2xl border border-dashed border-border/40 flex items-center justify-center h-40">
                  <span className="text-xs text-muted-foreground">{d}m — Waiting...</span>
                </div>
              );
              return (
                <RoundCard
                  key={market.id}
                  market={market}
                  myBets={myBets}
                  onBetPlaced={() => { void fetchMarkets(); void fetchMyBets(); }}
                  walletAddress={walletAddress}
                  walletType={walletType}
                  onNeedWallet={() => setShowWalletDialog(true)}
                />
              );
            })}
          </div>
        )}

        <div className="mt-6 rounded-2xl bg-muted/40 px-4 py-4 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground text-sm mb-2">How it works</p>
          <p>Predict whether the price will be <strong>UP</strong> or <strong>DOWN</strong> at the end of the round.</p>
          <p>The strike price is locked at open. Winners share the pool minus 5% fee.</p>
          <p>USDC only. Min $2 per predict. Multiple predicts allowed per round.</p>
        </div>
      </div>

      {showWalletDialog && (
        <WalletSelectDialog
          wallets={getAvailableWallets()}
          onClose={() => setShowWalletDialog(false)}
          onSelect={async (type: WalletType) => {
            setShowWalletDialog(false);
            try {
              await connectWalletAndAuth(type);
            } catch (e: any) {
              toast.error(e?.message ?? "Connection failed");
            }
          }}
        />
      )}
    </div>
  );
}

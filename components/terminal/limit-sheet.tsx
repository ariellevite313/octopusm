"use client";

import { useEffect, useState } from "react";
import { VersionedTransaction } from "@solana/web3.js";
import { Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { getProviderByType, type WalletType } from "@/lib/wallet/adapters";
import { currentPath, feePayerOf, signWithoutProvider } from "@/lib/wallet/sign-fallback";
import { SOL_MINT, USDC_MINT } from "@/lib/swap/core";
import { TwapPanel } from "./twap-sheet";
import { Mirage } from "@/components/shared/mirage";
import { ActivityList } from "./activity";
import { OrderBook } from "./order-book";

type Order = { orderKey: string; inputMint: string; outputMint: string; makingAmount: string; takingAmount: string; createdAt: string };
const money = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`);
const parse = (s: string) => Number(s.replace(/[\s,$]/g, "").replace(/k$/i, "e3").replace(/m$/i, "e6").replace(/b$/i, "e9"));

export async function post<T>(body: unknown, url = "/api/terminal/limit"): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? "Limit order failed");
  return j;
}

/** Fait signer la transaction préparée par Jupiter, puis la fait envoyer par Jupiter (ou directement par le wallet). */
export async function signAndSend(txB64: string, requestId: string, walletType: WalletType, direct = false, url = "/api/terminal/limit"): Promise<string> {
  const bytes = Buffer.from(txB64, "base64");
  const provider = getProviderByType(walletType);
  if (!provider) return signWithoutProvider(walletType, feePayerOf(bytes), bytes, { returnTo: currentPath(), records: [] });
  const vtx = VersionedTransaction.deserialize(bytes);
  if (provider.signTransaction) {
    const signed = (await provider.signTransaction(vtx)) as { serialize(): Uint8Array };
    const r = await post<{ signature: string; status: string }>({ action: direct ? "send" : "execute", signedTransaction: Buffer.from(signed.serialize()).toString("base64"), requestId }, url);
    if (r.status && !/success/i.test(r.status)) throw new Error("Transaction failed");
    return r.signature;
  }
  if (provider.signAndSendTransaction) return (await provider.signAndSendTransaction(vtx, { skipPreflight: false, maxRetries: 3 })).signature;
  throw new Error("Wallet does not support signing");
}

/**
 * Ordres limités : acheter quand la capitalisation descend à un niveau, ou vendre (prise de profit ou stop) quand elle l'atteint.
 * Jupiter garde l'ordre et l'exécute tout seul, même si l'utilisateur n'est plus sur OM.
 */
/** Ordre préparé depuis le graphique (niveau Fibonacci ou ligne) : sens, capitalisation cible, libellé ; n change à chaque clic */
export type LimitPreset = { side: "buy" | "sell"; mcap: number; label: string; n: number };

/** activity : liste d'activité (moi et Janus) sous le formulaire, sur ordinateur */
export function LimitSheet({ mint, symbol, mcap, walletType, preset, activity = false }: { mint: string; symbol: string; mcap: number | null; walletType: WalletType; preset?: LimitPreset | null; activity?: boolean }) {
  const { tr } = useT();
  const [mode, setMode] = useState<"limit" | "twap">("limit");
  useEffect(() => { if (preset) setMode("limit"); }, [preset]);
  // SOL : ordre limité contre USDC, avec un prix cible
  if (mint === SOL_MINT) return <SolLimitForm walletType={walletType} activity={activity} />;
  return (
    <div>
      <div className="mb-3 flex gap-5">
        {(["limit", "twap"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`text-[16px] font-semibold ${mode === m ? "text-foreground" : "text-muted-foreground"}`}>{m === "limit" ? tr("Limit") : "TWAP"}</button>
        ))}
      </div>
      {mode === "limit" ? <LimitForm mint={mint} symbol={symbol} mcap={mcap} walletType={walletType} preset={preset ?? null} activity={activity} /> : <TwapPanel mint={mint} symbol={symbol} walletType={walletType} />}
    </div>
  );
}

type BookRow = { mcap: number; sol: number; om: boolean };
type Book = { mcap: number; price: number; solUsd: number; asks: BookRow[]; bids: BookRow[] };
const SOL_RESERVE = 0.01;
const amt = (n: number) => (n >= 1e9 ? `${+(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : n >= 1 ? `${+n.toFixed(2)}` : `${+n.toPrecision(3)}`);
/** Arrondi lisible d'une capitalisation (3 chiffres significatifs) */
const round3 = (n: number) => { const p = 10 ** (Math.floor(Math.log10(n)) - 2); return Math.round(n / p) * p; };

function LimitForm({ mint, symbol, mcap: mcap0, walletType, preset, activity = false }: { mint: string; symbol: string; mcap: number | null; walletType: WalletType; preset: LimitPreset | null; activity?: boolean }) {
  const { tr } = useT();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [target, setTarget] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  useEffect(() => {
    if (!preset || !(preset.mcap > 0)) return;
    setSide(preset.side); setTarget(String(round3(preset.mcap))); setTag(preset.label); setAmount("");
  }, [preset]);
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [bal, setBal] = useState<{ sol: number; token: number } | null>(null);
  const load = () => fetch(`/api/terminal/limit?mint=${mint}`).then((r) => r.json()).then((j) => setOrders(j.orders ?? [])).catch(() => setOrders([]));
  const loadBook = () => fetch(`/api/terminal/book?mint=${mint}`).then((r) => (r.ok ? r.json() : null)).then((j) => j && setBook(j)).catch(() => {});
  const loadBal = () => fetch(`/api/swap/token?mint=${mint}`, { cache: "no-store" }).then((r) => r.json()).then((j) => {
    if (j.balances) setBal({ sol: Number(j.balances.sol) / 1e9, token: Number(j.balances.token) / 10 ** (j.token?.decimals ?? 6) });
  }).catch(() => {});
  useEffect(() => {
    load(); loadBook(); loadBal();
    const id = setInterval(loadBook, 5_000);
    return () => clearInterval(id);
  }, [mint]); // eslint-disable-line react-hooks/exhaustive-deps

  const mcap = book?.mcap ?? mcap0;
  const t = parse(target), a = Number(amount.replace(",", "."));
  const avail = bal ? (side === "buy" ? Math.max(0, bal.sol - SOL_RESERVE) : bal.token) : null;
  // Un ordre limité s'exécute dès que le prix est meilleur que la cible : acheter sous le prix actuel, vendre au-dessus.
  // (Un « stop » sous le prix actuel serait vendu tout de suite : on ne le propose pas.)
  const wrongSide = mcap != null && t > 0 && (side === "buy" ? t >= mcap : t <= mcap);
  const tooMuch = avail != null && a > avail;
  const ok = a > 0 && t > 0 && mcap != null && !wrongSide && !tooMuch;
  // Ce que l'ordre rapporte s'il est exécuté à la cible
  const atTarget = book && t > 0 ? book.price * (t / book.mcap) : 0;
  const receive = !book || !atTarget || !(a > 0) ? null : side === "buy" ? (a * book.solUsd) / atTarget : (a * atTarget) / book.solUsd;

  function nudge(dir: 1 | -1) {
    const base = t > 0 ? t : mcap ?? 0;
    if (base > 0) setTarget(String(round3(base * (1 + dir * 0.02))));
  }
  function pick(r: BookRow, ask: boolean) { setSide(ask ? "sell" : "buy"); setTarget(String(round3(r.mcap))); }
  function setPct(p: number) {
    if (avail == null) return;
    const v = (avail * p) / 100;
    setAmount(v > 0 ? String(side === "buy" ? +v.toFixed(4) : +v.toPrecision(6)) : "");
  }

  async function create() {
    setBusy(true);
    try {
      const r = await post<{ transaction: string; requestId: string; direct?: boolean }>({ action: "create", side, mint, amount: a, targetMcap: t });
      await signAndSend(r.transaction, r.requestId, walletType, !!r.direct);
      toast.success(tr("Limit order placed"));
      setAmount(""); setTarget("");
      setTimeout(() => { load(); loadBook(); loadBal(); }, 2500);
    } catch (e) {
      const m = (e as Error).message ?? "";
      if (!/reject|cancel|denied|declined/i.test(m)) toast.error(tr(m) || tr("Limit order failed"));
    }
    setBusy(false);
  }
  async function cancel(order: string) {
    try {
      const r = await post<{ transaction: string; requestId: string }>({ action: "cancel", order });
      await signAndSend(r.transaction, r.requestId, walletType);
      toast.success(tr("Order cancelled"));
      setTimeout(() => { load(); loadBook(); }, 2500);
    } catch (e) {
      const m = (e as Error).message ?? "";
      if (!/reject|cancel|denied|declined/i.test(m)) toast.error(tr(m) || tr("Limit order failed"));
    }
  }
  const hint = wrongSide ? tr(side === "buy" ? "For a limit buy, the target must be below the current market cap." : "For a limit sell, the target must be above the current market cap.")
    : tooMuch ? tr("Insufficient {symbol} balance", { symbol: side === "buy" ? "SOL" : symbol }) : "";

  return (
    <div>
      {/* Carnet animé : profondeur de la pool + ordres limités placés sur OM */}
      <OrderBook book={book} onPick={pick} />
      <div className="mt-4 min-w-0">
          <div className="flex gap-1 rounded-xl bg-muted p-1">
            {(["buy", "sell"] as const).map((k) => <button key={k} onClick={() => { setSide(k); setAmount(""); }} className={`flex-1 rounded-lg py-2 text-[14px] font-bold ${side === k ? "bg-foreground text-background" : "text-muted-foreground"}`}>{tr(k === "buy" ? "Buy" : "Sell")}</button>)}
          </div>
          <div className="mt-2 flex justify-between text-[12px]"><span className="text-muted-foreground">{tr("Available")}</span><span className="num font-semibold">{avail == null ? "-" : side === "buy" ? `${amt(avail)} SOL` : amt(avail)}</span></div>

          <div className="mt-2 flex h-12 items-center justify-between rounded-xl bg-muted pl-3 pr-2">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">{tr("Target MC")}{tag && <span className="rounded bg-foreground px-1.5 py-px text-[9px] font-bold text-background">{tag}</span>}</p>
              <input inputMode="decimal" value={target} onChange={(e) => { setTarget(e.target.value); setTag(null); }} placeholder={mcap ? money(round3(mcap * (side === "buy" ? 0.9 : 1.5))).slice(1) : "500k"} className="num w-full bg-transparent text-[14px] font-bold outline-none" />
            </div>
            <div className="flex items-center text-muted-foreground">
              <button onClick={() => nudge(-1)} aria-label="-" className="p-1 hover:text-foreground"><Minus className="size-4" /></button>
              <span className="mx-1 h-4 w-px bg-border" />
              <button onClick={() => nudge(1)} aria-label="+" className="p-1 hover:text-foreground"><Plus className="size-4" /></button>
            </div>
          </div>

          <div className="mt-2 flex h-12 items-center justify-between rounded-xl bg-muted px-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-muted-foreground">{tr("Amount")}</p>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={side === "buy" ? "0.5" : "100000"} className="num w-full bg-transparent text-[14px] font-bold outline-none" />
            </div>
            <span className="ml-2 max-w-[70px] truncate text-[13px] font-semibold">{side === "buy" ? "SOL" : symbol}</span>
          </div>
          <div className="mt-2 flex justify-between">
            {[25, 50, 75, 100].map((p) => <button key={p} onClick={() => setPct(p)} disabled={avail == null} className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40">{p === 100 ? tr("Max") : `${p}%`}</button>)}
          </div>

          <div className="mt-2 space-y-1 text-[12px]">
            <div className="flex justify-between"><span className="text-muted-foreground">{tr("Receive")}</span><span className="num font-semibold">{receive == null ? "-" : side === "buy" ? amt(receive) : `${amt(receive)} SOL`}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{tr("Fee")}</span><span className="num font-semibold">0.3%</span></div>
          </div>
          {hint && <p className="mt-2 text-[12px] text-down">{hint}</p>}
          <button disabled={!ok || busy} onClick={create} className="mt-3 h-12 w-full rounded-xl bg-foreground text-[15px] font-bold text-background disabled:opacity-40">{busy ? <Mirage className="mx-auto size-4" /> : tr(side === "buy" ? "Place limit buy" : "Place limit sell")}</button>
          {activity && <div className="mt-4 min-w-0"><ActivityList mint={mint} compact bare /></div>}
        </div>
      <p className="mt-3 text-[12px] text-muted-foreground">{tr("Orders are held and filled by Jupiter, even when you are away. Minimum about $5. OM fee 0.3%, taken in SOL when the order is placed.")}</p>

      {orders && orders.length > 0 && (
        <div className="mt-4">
          <p className="text-[13px] font-semibold text-muted-foreground">{tr("Open orders")}</p>
          {orders.map((o) => {
            const buy = o.inputMint === SOL_MINT;
            return (
              <div key={o.orderKey} className="flex items-center justify-between border-b border-border py-2.5 text-[14px]">
                <span className={buy ? "text-up" : "text-down"}>{tr(buy ? "Limit buy" : "Limit sell")}</span>
                <span className="num text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</span>
                <button onClick={() => cancel(o.orderKey)} aria-label={tr("Cancel")} className="text-muted-foreground hover:text-foreground"><Trash2 className="size-4" /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** SOL contre USDC : acheter du SOL avec des USDC quand le prix descend, ou vendre du SOL quand il monte. Prix cible en dollars. */
function SolLimitForm({ walletType, activity = false }: { walletType: WalletType; activity?: boolean }) {
  const { tr } = useT();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [bal, setBal] = useState<{ sol: number; usdc: number } | null>(null);
  const load = () => fetch(`/api/terminal/limit?mint=${SOL_MINT}`).then((r) => r.json()).then((j) => setOrders(j.orders ?? [])).catch(() => setOrders([]));
  const loadPrice = () => fetch(`https://api.dexscreener.com/tokens/v1/solana/${SOL_MINT}`).then((r) => (r.ok ? r.json() : [])).then((j: { baseToken?: { address?: string }; priceUsd?: string; liquidity?: { usd?: number } }[]) => {
    const p = j.filter((x) => x.baseToken?.address === SOL_MINT).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    if (p && Number(p.priceUsd) > 0) setPrice(Number(p.priceUsd));
  }).catch(() => {});
  const loadBal = () => fetch(`/api/swap/token?mint=${USDC_MINT}`, { cache: "no-store" }).then((r) => r.json()).then((j) => {
    if (j.balances) setBal({ sol: Number(j.balances.sol) / 1e9, usdc: Number(j.balances.token) / 1e6 });
  }).catch(() => {});
  useEffect(() => {
    load(); loadPrice(); loadBal();
    const id = setInterval(loadPrice, 10_000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const t = Number(target.replace(/[\s,$]/g, "")), a = Number(amount.replace(",", "."));
  const avail = bal ? (side === "buy" ? bal.usdc : Math.max(0, bal.sol - SOL_RESERVE)) : null;
  const wrongSide = price != null && t > 0 && (side === "buy" ? t >= price : t <= price);
  const tooMuch = avail != null && a > avail;
  const ok = a > 0 && t > 0 && price != null && !wrongSide && !tooMuch;
  const receive = t > 0 && a > 0 ? (side === "buy" ? a / t : a * t) : null;
  const fix = (n: number) => String(+n.toFixed(n >= 100 ? 2 : 3));
  function nudge(dir: 1 | -1) { const base = t > 0 ? t : price ?? 0; if (base > 0) setTarget(fix(base * (1 + dir * 0.01))); }
  function setPct(p: number) { if (avail == null) return; const v = (avail * p) / 100; setAmount(v > 0 ? String(+v.toFixed(side === "buy" ? 2 : 4)) : ""); }

  async function create() {
    setBusy(true);
    try {
      const r = await post<{ transaction: string; requestId: string; direct?: boolean }>({ action: "create", side, mint: SOL_MINT, amount: a, targetPrice: t });
      await signAndSend(r.transaction, r.requestId, walletType, !!r.direct);
      toast.success(tr("Limit order placed"));
      setAmount(""); setTarget("");
      setTimeout(() => { load(); loadBal(); }, 2500);
    } catch (e) {
      const m = (e as Error).message ?? "";
      if (!/reject|cancel|denied|declined/i.test(m)) toast.error(tr(m) || tr("Limit order failed"));
    }
    setBusy(false);
  }
  async function cancel(order: string) {
    try {
      const r = await post<{ transaction: string; requestId: string }>({ action: "cancel", order });
      await signAndSend(r.transaction, r.requestId, walletType);
      toast.success(tr("Order cancelled"));
      setTimeout(load, 2500);
    } catch (e) {
      const m = (e as Error).message ?? "";
      if (!/reject|cancel|denied|declined/i.test(m)) toast.error(tr(m) || tr("Limit order failed"));
    }
  }
  const unit = side === "buy" ? "USDC" : "SOL";
  const hint = wrongSide ? tr(side === "buy" ? "For a limit buy, the target must be below the current price." : "For a limit sell, the target must be above the current price.")
    : tooMuch ? tr("Insufficient {symbol} balance", { symbol: unit }) : "";

  return (
    <div>
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        {(["buy", "sell"] as const).map((k) => <button key={k} onClick={() => { setSide(k); setAmount(""); }} className={`flex-1 rounded-lg py-2 text-[14px] font-bold ${side === k ? "bg-foreground text-background" : "text-muted-foreground"}`}>{tr(k === "buy" ? "Buy" : "Sell")} SOL</button>)}
      </div>
      <div className="mt-2 flex justify-between text-[12px]"><span className="text-muted-foreground">{tr("Price")}</span><span className="num font-semibold">{price == null ? "-" : `$${price.toFixed(2)}`}</span></div>
      <div className="mt-1 flex justify-between text-[12px]"><span className="text-muted-foreground">{tr("Available")}</span><span className="num font-semibold">{avail == null ? "-" : `${amt(avail)} ${unit}`}</span></div>

      <div className="mt-2 flex h-12 items-center justify-between rounded-xl bg-muted pl-3 pr-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-muted-foreground">{tr("Target price")} (USD)</p>
          <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={price ? fix(price * (side === "buy" ? 0.95 : 1.05)) : "70"} className="num w-full bg-transparent text-[14px] font-bold outline-none" />
        </div>
        <div className="flex items-center text-muted-foreground">
          <button onClick={() => nudge(-1)} aria-label="-" className="p-1 hover:text-foreground"><Minus className="size-4" /></button>
          <span className="mx-1 h-4 w-px bg-border" />
          <button onClick={() => nudge(1)} aria-label="+" className="p-1 hover:text-foreground"><Plus className="size-4" /></button>
        </div>
      </div>

      <div className="mt-2 flex h-12 items-center justify-between rounded-xl bg-muted px-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-muted-foreground">{tr("Amount")}</p>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={side === "buy" ? "50" : "0.5"} className="num w-full bg-transparent text-[14px] font-bold outline-none" />
        </div>
        <span className="ml-2 text-[13px] font-semibold">{unit}</span>
      </div>
      <div className="mt-2 flex justify-between">
        {[25, 50, 75, 100].map((p) => <button key={p} onClick={() => setPct(p)} disabled={avail == null} className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40">{p === 100 ? tr("Max") : `${p}%`}</button>)}
      </div>
      <div className="mt-2 space-y-1 text-[12px]">
        <div className="flex justify-between"><span className="text-muted-foreground">{tr("Receive")}</span><span className="num font-semibold">{receive == null ? "-" : side === "buy" ? `${amt(receive)} SOL` : `${amt(receive)} USDC`}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">{tr("Fee")}</span><span className="num font-semibold">0.3%</span></div>
      </div>
      {hint && <p className="mt-2 text-[12px] text-down">{hint}</p>}
      <button disabled={!ok || busy} onClick={create} className="mt-3 h-12 w-full rounded-xl bg-foreground text-[15px] font-bold text-background disabled:opacity-40">{busy ? <Mirage className="mx-auto size-4" /> : tr(side === "buy" ? "Place limit buy" : "Place limit sell")}</button>
      <p className="mt-3 text-[12px] text-muted-foreground">{tr("Orders are held and filled by Jupiter, even when you are away. Minimum about $5. OM fee 0.3%, taken in SOL when the order is placed.")}</p>

      {orders && orders.length > 0 && (
        <div className="mt-4">
          <p className="text-[13px] font-semibold text-muted-foreground">{tr("Open orders")}</p>
          {orders.map((o) => {
            const buy = o.inputMint === USDC_MINT;
            return (
              <div key={o.orderKey} className="flex items-center justify-between border-b border-border py-2.5 text-[14px]">
                <span className={buy ? "text-up" : "text-down"}>{tr(buy ? "Limit buy" : "Limit sell")}</span>
                <span className="num text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</span>
                <button onClick={() => cancel(o.orderKey)} aria-label={tr("Cancel")} className="text-muted-foreground hover:text-foreground"><Trash2 className="size-4" /></button>
              </div>
            );
          })}
        </div>
      )}
      {activity && <div className="mt-4 min-w-0"><ActivityList mint={SOL_MINT} compact bare /></div>}
    </div>
  );
}

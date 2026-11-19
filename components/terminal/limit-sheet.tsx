"use client";

import { useEffect, useState } from "react";
import { VersionedTransaction } from "@solana/web3.js";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { getProviderByType, type WalletType } from "@/lib/wallet/adapters";
import { currentPath, feePayerOf, signWithoutProvider } from "@/lib/wallet/sign-fallback";
import { SOL_MINT } from "@/lib/swap/core";
import { TwapPanel } from "./twap-sheet";

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
export function LimitSheet({ mint, symbol, mcap, walletType }: { mint: string; symbol: string; mcap: number | null; walletType: WalletType }) {
  const { tr } = useT();
  const [mode, setMode] = useState<"limit" | "twap">("limit");
  return (
    <div>
      <div className="mb-3 flex gap-5">
        {(["limit", "twap"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`text-[16px] font-semibold ${mode === m ? "text-foreground" : "text-muted-foreground"}`}>{m === "limit" ? tr("Limit") : "TWAP"}</button>
        ))}
      </div>
      {mode === "limit" ? <LimitForm mint={mint} symbol={symbol} mcap={mcap} walletType={walletType} /> : <TwapPanel mint={mint} symbol={symbol} walletType={walletType} />}
    </div>
  );
}

function LimitForm({ mint, symbol, mcap, walletType }: { mint: string; symbol: string; mcap: number | null; walletType: WalletType }) {
  const { tr } = useT();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const load = () => fetch(`/api/terminal/limit?mint=${mint}`).then((r) => r.json()).then((j) => setOrders(j.orders ?? [])).catch(() => setOrders([]));
  useEffect(() => { load(); }, [mint]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = parse(target), a = Number(amount.replace(",", "."));
  // Un ordre limité s'exécute dès que le prix est meilleur que la cible : acheter sous le prix actuel, vendre au-dessus.
  // (Un « stop » sous le prix actuel serait vendu tout de suite : on ne le propose pas.)
  const wrongSide = mcap != null && t > 0 && (side === "buy" ? t >= mcap : t <= mcap);
  const ok = a > 0 && t > 0 && mcap != null && !wrongSide;
  async function create() {
    setBusy(true);
    try {
      const r = await post<{ transaction: string; requestId: string; direct?: boolean }>({ action: "create", side, mint, amount: a, targetMcap: t });
      await signAndSend(r.transaction, r.requestId, walletType, !!r.direct);
      toast.success(tr("Limit order placed"));
      setAmount(""); setTarget("");
      setTimeout(load, 2500);
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
  const hint = wrongSide ? tr(side === "buy" ? "For a limit buy, the target must be below the current market cap." : "For a limit sell, the target must be above the current market cap.")
    : !ok ? "" : side === "buy"
    ? tr("Buy {sym} with {a} SOL when the market cap reaches {t}.", { sym: `$${symbol}`, a, t: money(t) })
    : tr("Take profit: sell {a} {sym} when the market cap reaches {t}.", { sym: `$${symbol}`, a, t: money(t) });

  return (
    <div>
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        {(["buy", "sell"] as const).map((k) => <button key={k} onClick={() => setSide(k)} className={`flex-1 rounded-lg py-2 text-[14px] font-semibold ${side === k ? "bg-background text-foreground" : "text-muted-foreground"}`}>{tr(k === "buy" ? "Limit buy" : "Limit sell")}</button>)}
      </div>
      <p className="num mt-3 text-[13px] text-muted-foreground">{tr("Market cap now")}: <span className="font-semibold text-foreground">{mcap != null ? money(mcap) : "-"}</span></p>
      <label className="mt-3 block text-[13px] font-semibold text-muted-foreground">{side === "buy" ? tr("Amount (SOL)") : tr("Amount ({sym})", { sym: symbol })}</label>
      <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={side === "buy" ? "0.5" : "100000"} className="num mt-1 h-12 w-full rounded-2xl bg-muted px-4 text-[16px] outline-none" />
      <label className="mt-3 block text-[13px] font-semibold text-muted-foreground">{tr("Target market cap")}</label>
      <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="500k" className="num mt-1 h-12 w-full rounded-2xl bg-muted px-4 text-[16px] outline-none" />
      {hint && <p className="mt-2 text-[13px] text-foreground">{hint}</p>}
      <button disabled={!ok || busy} onClick={create} className="mt-3 h-12 w-full rounded-2xl bg-foreground text-[15px] font-bold text-background disabled:opacity-40">{busy ? <Loader2 className="mx-auto size-4 animate-spin" /> : tr("Place order")}</button>
      <p className="mt-2 text-[12px] text-muted-foreground">{tr("Orders are held and filled by Jupiter, even when you are away. Minimum about $5. OM fee 0.3%, taken in SOL when the order is placed.")}</p>

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

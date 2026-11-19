"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import type { WalletType } from "@/lib/wallet/adapters";
import { SOL_MINT } from "@/lib/swap/core";
import { post, signAndSend } from "./limit-sheet";
import { Mirage } from "@/components/shared/mirage";

const TWAP_URL = "/api/terminal/twap";
type Order = { orderKey: string; inputMint: string; outputMint: string; createdAt: string };
/** Intervalles (mêmes valeurs que le serveur) */
const INTERVALS: { s: number; label: string }[] = [
  { s: 60, label: "1m" }, { s: 300, label: "5m" }, { s: 900, label: "15m" },
  { s: 3600, label: "1h" }, { s: 14_400, label: "4h" }, { s: 86_400, label: "1d" },
];
const dur = (sec: number) => (sec >= 86_400 ? `${+(sec / 86_400).toFixed(1)}d` : sec >= 3600 ? `${+(sec / 3600).toFixed(1)}h` : `${Math.round(sec / 60)}m`);

/**
 * TWAP : un achat ou une vente découpé en plusieurs parts, une part à chaque intervalle. Moins d'impact sur le prix
 * qu'un gros ordre d'un coup. Jupiter exécute les parts, même quand l'utilisateur n'est plus sur OM.
 */
export function TwapPanel({ mint, symbol, walletType }: { mint: string; symbol: string; walletType: WalletType }) {
  const { tr } = useT();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [parts, setParts] = useState(4);
  const [interval, setIntervalS] = useState(3600);
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const load = () => fetch(`${TWAP_URL}?mint=${mint}`).then((r) => r.json()).then((j) => setOrders(j.orders ?? [])).catch(() => setOrders([]));
  useEffect(() => { load(); }, [mint]); // eslint-disable-line react-hooks/exhaustive-deps

  const a = Number(amount.replace(",", "."));
  const ok = a > 0 && parts >= 2 && parts <= 100;
  const unit = side === "buy" ? "SOL" : symbol;
  const per = a > 0 ? +(a / parts).toPrecision(4) : 0;

  async function create() {
    setBusy(true);
    try {
      const r = await post<{ transaction: string; requestId: string; direct?: boolean }>({ action: "create", side, mint, amount: a, parts, interval }, TWAP_URL);
      await signAndSend(r.transaction, r.requestId, walletType, !!r.direct, TWAP_URL);
      toast.success(tr("TWAP order placed"));
      setAmount("");
      setTimeout(load, 2500);
    } catch (e) {
      const m = (e as Error).message ?? "";
      if (!/reject|cancel|denied|declined/i.test(m)) toast.error(tr(m) || tr("TWAP order failed"));
    }
    setBusy(false);
  }
  async function cancel(order: string) {
    try {
      const r = await post<{ transaction: string; requestId: string }>({ action: "cancel", order }, TWAP_URL);
      await signAndSend(r.transaction, r.requestId, walletType, false, TWAP_URL);
      toast.success(tr("Order cancelled"));
      setTimeout(load, 2500);
    } catch (e) {
      const m = (e as Error).message ?? "";
      if (!/reject|cancel|denied|declined/i.test(m)) toast.error(tr(m) || tr("TWAP order failed"));
    }
  }

  return (
    <div>
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        {(["buy", "sell"] as const).map((k) => <button key={k} onClick={() => setSide(k)} className={`flex-1 rounded-lg py-2 text-[14px] font-semibold ${side === k ? "bg-background text-foreground" : "text-muted-foreground"}`}>{tr(k === "buy" ? "Buy" : "Sell")}</button>)}
      </div>
      <label className="mt-3 block text-[13px] font-semibold text-muted-foreground">{side === "buy" ? tr("Total amount (SOL)") : tr("Total amount ({sym})", { sym: symbol })}</label>
      <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={side === "buy" ? "1" : "100000"} className="num mt-1 h-12 w-full rounded-2xl bg-muted px-4 text-[16px] outline-none" />

      <label className="mt-3 block text-[13px] font-semibold text-muted-foreground">{tr("Number of parts")}</label>
      <div className="mt-1 flex items-center gap-2">
        {[2, 4, 6, 10].map((n) => <button key={n} onClick={() => setParts(n)} className={`h-10 flex-1 rounded-xl text-[14px] font-semibold ${parts === n ? "bg-foreground text-background" : "bg-muted text-foreground"}`}>{n}</button>)}
      </div>

      <label className="mt-3 block text-[13px] font-semibold text-muted-foreground">{tr("One part every")}</label>
      <div className="mt-1 grid grid-cols-6 gap-1.5">
        {INTERVALS.map((i) => <button key={i.s} onClick={() => setIntervalS(i.s)} className={`h-10 rounded-xl text-[13px] font-semibold ${interval === i.s ? "bg-foreground text-background" : "bg-muted text-foreground"}`}>{i.label}</button>)}
      </div>

      {ok && (
        <p className="mt-3 text-[13px] text-foreground">
          {tr(side === "buy" ? "Buy {sym} with {per} {unit} every {every}, {n} times, over {total}." : "Sell {per} {unit} every {every}, {n} times, over {total}.",
            { sym: `$${symbol}`, per, unit, every: dur(interval), n: parts, total: dur(interval * (parts - 1)) })}
        </p>
      )}
      <button disabled={!ok || busy} onClick={create} className="mt-3 h-12 w-full rounded-2xl bg-foreground text-[15px] font-bold text-background disabled:opacity-40">{busy ? <Mirage className="mx-auto size-4" /> : tr("Place TWAP order")}</button>
      <p className="mt-2 text-[12px] text-muted-foreground">{tr("Jupiter fills each part on time, even when you are away. Minimum $100 in total and $50 per part. OM fee 0.3%, taken in SOL when the order is placed.")}</p>

      {orders && orders.length > 0 && (
        <div className="mt-4">
          <p className="text-[13px] font-semibold text-muted-foreground">{tr("Open TWAP orders")}</p>
          {orders.map((o) => {
            const buy = o.inputMint === SOL_MINT;
            return (
              <div key={o.orderKey} className="flex items-center justify-between border-b border-border py-2.5 text-[14px]">
                <span className={buy ? "text-up" : "text-down"}>{tr(buy ? "TWAP buy" : "TWAP sell")}</span>
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

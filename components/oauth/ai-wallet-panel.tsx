"use client";

/**
 * Wallet autonome d'une IA connectée : créer, approvisionner (adresses), régler plafonds et permissions,
 * mettre en pause, tout retirer vers mon wallet, voir le journal des actions.
 */
import { useState } from "react";
import { Copy, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export type AiWallet = {
  id: string; client_id: string; name: string; sol_address: string; evm_address: string;
  max_action_usd: number; max_day_usd: number; allow_trade: boolean; allow_launch: boolean; allow_bet: boolean; paused: boolean;
  balances: { sol: number | null; usdc_solana: number; usdc_arc: number | null };
  spent_today_usd: number;
  actions: { kind: string; amount_usd: number; status: string; summary: string; tx: string | null; error: string | null; created_at: string }[];
};

const short = (a: string) => `${a.slice(0, 5)}...${a.slice(-5)}`;
const fmt = (n: number | null, d = 4) => (n === null ? "-" : n.toLocaleString("en-US", { maximumFractionDigits: d }));

function Addr({ label, value }: { label: string; value: string }) {
  const { tr } = useT();
  return (
    <button onClick={() => navigator.clipboard.writeText(value).then(() => toast.success(tr("Address copied"))).catch(() => {})}
      className="flex w-full items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2.5 text-left">
      <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-mono text-[13px] text-foreground">{short(value)}<Copy className="size-3.5 text-muted-foreground" /></span>
    </button>
  );
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className="flex w-full items-center justify-between py-2 text-[14px]">
      <span className="font-semibold">{label}</span>
      <span className={`relative h-6 w-10 rounded-full transition-colors ${on ? "bg-foreground" : "bg-muted"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-background shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export function AiWalletCreate({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const { tr } = useT();
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      const r = await fetch("/api/agent-wallets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not create the wallet");
      toast.success(tr("Wallet created. Fund it to let your AI act."));
      onDone();
    } catch (e) { toast.error(tr((e as Error).message)); }
    setBusy(false);
  }
  return (
    <div className="mt-3 rounded-xl bg-muted/50 p-3">
      <p className="text-[13px] text-muted-foreground">{tr("Give this AI its own wallet: it can then trade, launch tokens, bet and create markets alone, within the limits you set. Withdrawals only go back to you.")}</p>
      <button onClick={create} disabled={busy} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[14px] font-bold text-background disabled:opacity-50">
        {busy && <Loader2 className="size-4 animate-spin" />}{tr("Create a wallet for this AI")}
      </button>
    </div>
  );
}

export function AiWalletPanel({ w, ownerIsEvm, onChange }: { w: AiWallet; ownerIsEvm: boolean; onChange: () => void }) {
  const { tr } = useT();
  const [perAction, setPerAction] = useState(String(w.max_action_usd));
  const [perDay, setPerDay] = useState(String(w.max_day_usd));
  const [busy, setBusy] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      const r = await fetch(`/api/agent-wallets/${w.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not save");
      toast.success(tr("Saved"));
      onChange();
    } catch (e) { toast.error(tr((e as Error).message)); }
    setBusy(null);
  }
  async function withdraw() {
    if (!window.confirm(tr("Send the whole balance of this AI wallet back to your wallet?"))) return;
    setBusy("withdraw");
    try {
      const r = await fetch(`/api/agent-wallets/${w.id}/withdraw`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "The withdrawal failed");
      toast.success(tr("Withdrawal sent to your wallet"));
      onChange();
    } catch (e) { toast.error(tr((e as Error).message)); }
    setBusy(null);
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-muted/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">{tr("AI wallet")}</span>
        {w.paused && <span className="rounded-full bg-foreground px-2.5 py-0.5 text-[11px] font-bold text-background">{tr("Paused")}</span>}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[["SOL", fmt(w.balances.sol)], ["USDC Solana", fmt(w.balances.usdc_solana, 2)], ["USDC Arc", fmt(w.balances.usdc_arc, 2)]].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-card p-2.5"><p className="num text-[16px] font-bold">{v}</p><p className="text-[11px] text-muted-foreground">{l}</p></div>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="text-[12px] text-muted-foreground">{tr("Fund it by sending SOL or USDC to these addresses:")}</p>
        <Addr label="Solana" value={w.sol_address} />
        <Addr label="Arc" value={w.evm_address} />
      </div>

      <div className="rounded-xl bg-card p-3">
        <p className="text-[13px] text-muted-foreground">{tr("Spent today: ${a} of ${b}", { a: w.spent_today_usd.toFixed(2), b: Number(w.max_day_usd) })}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[12px] font-semibold text-muted-foreground">{tr("Max per action ($)")}
            <input value={perAction} onChange={(e) => setPerAction(e.target.value)} inputMode="decimal" className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-[14px] text-foreground" />
          </label>
          <label className="text-[12px] font-semibold text-muted-foreground">{tr("Max per day ($)")}
            <input value={perDay} onChange={(e) => setPerDay(e.target.value)} inputMode="decimal" className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-[14px] text-foreground" />
          </label>
        </div>
        <button onClick={() => patch({ max_action_usd: Number(perAction), max_day_usd: Number(perDay) }, "limits")} disabled={busy === "limits"}
          className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[13px] font-bold text-background disabled:opacity-50">
          {busy === "limits" && <Loader2 className="size-4 animate-spin" />}{tr("Save limits")}
        </button>
        <div className="mt-2 divide-y divide-border">
          <Toggle on={w.allow_trade} label={tr("Trade (Terminal and OM tokens)")} onChange={(v) => patch({ allow_trade: v }, "t")} />
          <Toggle on={w.allow_launch} label={tr("Launch tokens")} onChange={(v) => patch({ allow_launch: v }, "l")} />
          <Toggle on={w.allow_bet} label={tr("Bet and create markets")} onChange={(v) => patch({ allow_bet: v }, "b")} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => patch({ paused: !w.paused }, "pause")} disabled={busy === "pause"} className="flex h-11 items-center justify-center gap-2 rounded-full bg-muted text-[14px] font-bold text-foreground">
          {w.paused ? <Play className="size-4" /> : <Pause className="size-4" />}{w.paused ? tr("Resume") : tr("Pause")}
        </button>
        <button onClick={withdraw} disabled={busy === "withdraw"} className="flex h-11 items-center justify-center gap-2 rounded-full bg-muted text-[14px] font-bold text-foreground disabled:opacity-50">
          {busy === "withdraw" && <Loader2 className="size-4 animate-spin" />}{tr("Withdraw all")}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">{ownerIsEvm ? tr("Withdraw sends the Arc USDC back to your wallet. To get Solana funds back, connect with your Solana wallet.") : tr("Withdraw sends SOL and USDC back to your Solana wallet. To get Arc funds back, connect with your Arc wallet.")}</p>

      {w.actions.length > 0 && (
        <div>
          <p className="mb-1 text-[13px] font-bold">{tr("Recent actions")}</p>
          <ul className="divide-y divide-border rounded-xl bg-card">
            {w.actions.map((a, i) => (
              <li key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-[12px]">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{a.summary || a.kind}</p>
                  <p className="text-muted-foreground">{new Date(a.created_at).toLocaleString()} · {a.status === "failed" ? `${tr("failed")}${a.error ? `: ${a.error}` : ""}` : a.status === "pending" ? tr("in progress") : tr("done")}</p>
                </div>
                {a.tx ? <a href={a.tx.startsWith("0x") ? `https://explorer.arc.io/tx/${a.tx}` : `https://solscan.io/tx/${a.tx}`} target="_blank" rel="noopener noreferrer" className="shrink-0 font-semibold text-foreground underline">{tr("View")}</a>
                  : Number(a.amount_usd) > 0 ? <span className="num shrink-0 font-semibold">${Number(a.amount_usd).toFixed(2)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

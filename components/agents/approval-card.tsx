"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Clock, ShieldCheck, X, ArrowUpRight, Ban } from "lucide-react";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";

export type Approval = {
  id: string;
  kind: "bet_pool" | "buy_token" | "sell_token";
  status: "pending" | "opened" | "rejected";
  expires_at: string;
  params: { amount?: number; currency?: string; unit?: string; option_id?: string };
  agent: { wallet: string; name: string | null; avatar: string | null };
  target: { title: string; image: string | null; href: string; option: string | null } | null;
};

const KIND = { bet_pool: "Predict on a pool", buy_token: "Buy a token", sell_token: "Sell a token" } as const;

export function ApprovalCard({ a }: { a: Approval }) {
  const { tr } = useT();
  const router = useRouter();
  const [status, setStatus] = useState(a.status);
  const expired = new Date(a.expires_at).getTime() < Date.now();
  const unit = a.kind === "bet_pool" ? (a.params.currency ?? "usdc").toUpperCase() : a.params.unit ?? "";

  async function act(action: "open" | "reject") {
    await fetch(`/api/approvals/${a.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => {});
    if (action === "reject") { setStatus("rejected"); return; }
    setStatus("opened");
    if (a.target) router.push(a.target.href);
  }

  const closed = status === "rejected" || expired || !a.target;

  return (
    <div className="rounded-[28px] border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="size-5" /></span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{tr("Request from an AI agent")}</p>
          <p className="truncate text-[15px] font-bold text-foreground">{a.agent.name ?? shortAddress(a.agent.wallet)}</p>
        </div>
      </div>

      <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground">{tr(KIND[a.kind])}</h1>

      {a.target ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-muted/50 p-3">
          {a.target.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.target.image} alt="" className="size-12 rounded-xl object-cover" />
          ) : <div className="size-12 rounded-xl bg-muted" />}
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{a.target.title}</p>
            {a.target.option && <p className="text-sm text-muted-foreground">{tr("Option")}: <span className="font-semibold text-foreground">{a.target.option}</span></p>}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{tr("This market or token is no longer available.")}</p>
      )}

      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">{tr("Amount")}</span>
        <span className="num text-2xl font-bold text-foreground">{a.params.amount} <span className="text-base font-semibold text-muted-foreground">{unit}</span></span>
      </div>

      <div className="mt-5 flex gap-3 rounded-2xl border border-border p-3 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-up" />
        <p>{tr("Nothing has been paid. The agent cannot spend your money. If you continue, you will confirm yourself on the usual screen, with your own wallet, and you can still change the amount.")}</p>
      </div>

      {status === "rejected" ? (
        <p className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground"><Ban className="size-4" />{tr("Request declined")}</p>
      ) : expired ? (
        <p className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground"><Clock className="size-4" />{tr("This request has expired")}</p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button onClick={() => act("reject")} className="flex items-center justify-center gap-2 rounded-full border border-border py-3 text-sm font-bold text-foreground hover:bg-muted">
            <X className="size-4" />{tr("Decline")}
          </button>
          <button onClick={() => act("open")} disabled={closed} className="flex items-center justify-center gap-2 rounded-full bg-foreground py-3 text-sm font-bold text-background disabled:opacity-40">
            {tr("Review and confirm")}<ArrowUpRight className="size-4" />
          </button>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        {tr("Agent wallet")}: <span className="font-mono">{shortAddress(a.agent.wallet)}</span>
      </p>
    </div>
  );
}

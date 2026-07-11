"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaymentRow } from "@/lib/supabase/types";
import Image from "next/image";

function shortAddr(addr: string) { return `${addr.slice(0, 4)}...${addr.slice(-4)}`; }

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function TokenAmount({ amount, token }: { amount: number; token: string }) {
  const isUsdc = token === "usdc";
  return (
    <span className="inline-flex items-center gap-1 font-semibold">
      {isUsdc ? amount.toFixed(2) : (amount / 1_000_000).toFixed(1) + "M"}
      <Image
        src={isUsdc ? "/usdc-coin.png" : "/clawdtrust-coin.png"}
        alt={isUsdc ? "USDC" : "CLT"}
        width={14}
        height={14}
        className="rounded-full"
      />
    </span>
  );
}

function TypeBadge({ flow }: { flow: string }) {
  if (flow === "pool_prediction")
    return (
      <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300">
        Pool
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">
      Market
    </span>
  );
}

export function AdminBetsClient({
  predictionPayments,
  poolPayments,
}: {
  predictionPayments: PaymentRow[];
  poolPayments: PaymentRow[];
}) {
  const router = useRouter();
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState("");

  const all = [
    ...predictionPayments.map((p) => ({ ...p, flow: "prediction" as string })),
    ...poolPayments.map((p) => ({ ...p, flow: "pool_prediction" as string })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  async function handleAction(paymentId: string, action: "approve" | "reject") {
    setProcessing(paymentId);
    setError("");
    try {
      const res = await fetch("/api/admin/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, action }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setProcessing(null);
    }
  }

  if (all.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <CheckCircle2 className="size-10 text-emerald-400" />
        <p className="text-muted-foreground">No predictions pending review.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Mobile cards */}
      <div className="space-y-3 sm:hidden">
        {all.map((p) => (
          <div key={p.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-foreground line-clamp-2">{p.title}</p>
                {p.subtitle && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Selection: <span className="font-medium text-foreground">{p.subtitle}</span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Wallet: <span className="font-mono">{shortAddr(p.user_wallet)}</span>
                </p>
              </div>
              <TypeBadge flow={p.flow} />
            </div>
            <div className="flex items-center justify-between">
              <TokenAmount amount={p.amount_usdc} token={p.token} />
              <span className="text-xs text-muted-foreground">{formatDate(p.created_at)}</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 rounded-full bg-emerald-500 text-white hover:bg-emerald-400"
                disabled={processing === p.id}
                onClick={() => handleAction(p.id, "approve")}
              >
                {processing === p.id
                  ? <LoaderCircle className="size-3 animate-spin" />
                  : <><CheckCircle2 className="mr-1 size-3" />Approve</>}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 rounded-full border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                disabled={processing === p.id}
                onClick={() => handleAction(p.id, "reject")}
              >
                <XCircle className="mr-1 size-3" />Reject
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {["Type", "Market", "Selection", "Wallet", "Stake", "Date", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {all.map((p) => (
              <tr key={p.id} className="hover:bg-muted/20">
                <td className="px-4 py-3 whitespace-nowrap">
                  <TypeBadge flow={p.flow} />
                </td>
                <td className="px-4 py-3 max-w-[180px]">
                  <p className="line-clamp-2 font-medium leading-5">{p.title}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.subtitle ?? "-"}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{shortAddr(p.user_wallet)}</td>
                <td className="px-4 py-3">
                  <TokenAmount amount={p.amount_usdc} token={p.token} />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(p.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="rounded-full bg-emerald-500 text-white text-xs hover:bg-emerald-400"
                      disabled={processing === p.id}
                      onClick={() => handleAction(p.id, "approve")}
                    >
                      {processing === p.id
                        ? <LoaderCircle className="size-3 animate-spin" />
                        : <><CheckCircle2 className="mr-1 size-3" />Approve</>}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full border-red-300 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                      disabled={processing === p.id}
                      onClick={() => handleAction(p.id, "reject")}
                    >
                      <XCircle className="mr-1 size-3" />Reject
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

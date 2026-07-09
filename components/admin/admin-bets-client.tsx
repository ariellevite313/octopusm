"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BetWithStatus } from "@/services/admin-service";
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

export function AdminBetsClient({ bets }: { bets: BetWithStatus[] }) {
  const router = useRouter();
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleAction(betId: string, action: "approve" | "reject") {
    setProcessing(betId);
    setError("");
    try {
      const res = await fetch("/api/admin/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betId, action }),
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

  if (bets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <CheckCircle2 className="size-10 text-emerald-400" />
        <p className="text-muted-foreground">No bets pending review.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Mobile cards */}
      <div className="space-y-3 sm:hidden">
        {bets.map((bet) => (
          <div key={bet.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div>
              <p className="font-semibold text-foreground line-clamp-2">{bet.market_title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Selection: <span className="font-medium text-foreground">{bet.selection_label}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Wallet: <span className="font-mono">{shortAddr(bet.wallet_address)}</span>
              </p>
            </div>
            <div className="flex items-center justify-between">
              <TokenAmount amount={bet.amount} token={bet.token} />
              <span className="text-xs text-muted-foreground">{formatDate(bet.created_at)}</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 rounded-full bg-emerald-500 text-white hover:bg-emerald-400"
                disabled={processing === bet.id}
                onClick={() => handleAction(bet.id, "approve")}
              >
                {processing === bet.id ? <LoaderCircle className="size-3 animate-spin" /> : <><CheckCircle2 className="mr-1 size-3" />Approve</>}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 rounded-full border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                disabled={processing === bet.id}
                onClick={() => handleAction(bet.id, "reject")}
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
              {["Market", "Selection", "Wallet", "Stake", "Potential", "Date", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bets.map((bet) => (
              <tr key={bet.id} className="hover:bg-muted/20">
                <td className="px-4 py-3 max-w-[180px]">
                  <p className="line-clamp-2 font-medium leading-5">{bet.market_title}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{bet.selection_label}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{shortAddr(bet.wallet_address)}</td>
                <td className="px-4 py-3">
                  <TokenAmount amount={bet.amount} token={bet.token} />
                </td>
                <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">
                  <TokenAmount amount={bet.net_reward} token={bet.token} />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(bet.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="rounded-full bg-emerald-500 text-white text-xs hover:bg-emerald-400"
                      disabled={processing === bet.id}
                      onClick={() => handleAction(bet.id, "approve")}
                    >
                      {processing === bet.id ? <LoaderCircle className="size-3 animate-spin" /> : <><CheckCircle2 className="mr-1 size-3" />Approve</>}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full border-red-300 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                      disabled={processing === bet.id}
                      onClick={() => handleAction(bet.id, "reject")}
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TokenLaunchRow } from "@/lib/supabase/types";

type LaunchStatus = "pending" | "paid" | "submitted" | "rejected";

const STATUS_LABELS: Record<LaunchStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  submitted: "Submitted",
  rejected: "Rejected",
};

const STATUS_COLORS: Record<LaunchStatus, string> = {
  pending:
    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300",
  submitted:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300",
  rejected:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300",
};

function shortAddr(s: string) {
  return s.length > 10 ? `${s.slice(0, 5)}…${s.slice(-4)}` : s;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AdminLaunchesClient({ launches }: { launches: TokenLaunchRow[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function updateStatus(launchId: string, status: LaunchStatus) {
    setLoading(launchId + status);
    try {
      const res = await fetch("/api/admin/launches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ launchId, status }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            {["Token", "Wallet", "Option", "Fee (SOL)", "Status", "Submitted", "Actions"].map(
              (h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap"
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {launches.map((l) => {
            const status = l.status as LaunchStatus;
            return (
              <tr key={l.id} className="hover:bg-muted/20">
                <td className="px-4 py-3">
                  <p className="font-semibold">{l.token_name}</p>
                  <p className="text-xs text-muted-foreground">{l.symbol}</p>
                  {l.mint_address && (
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {shortAddr(l.mint_address)}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {shortAddr(l.wallet_address)}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                    {l.launch_option}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold">{l.fee_amount_sol}</td>
                <td className="px-4 py-3">
                  <Badge className={`text-xs ${STATUS_COLORS[status]}`}>
                    {STATUS_LABELS[status]}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(l.created_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!loading}
                          className="rounded-full border-orange-300 text-orange-700 text-xs hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300"
                          onClick={() => updateStatus(l.id, "paid")}
                        >
                          {loading === l.id + "paid" ? (
                            <LoaderCircle className="size-3 animate-spin" />
                          ) : (
                            "Mark paid"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!loading}
                          className="rounded-full border-red-300 text-red-600 text-xs hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                          onClick={() => updateStatus(l.id, "rejected")}
                        >
                          {loading === l.id + "rejected" ? (
                            <LoaderCircle className="size-3 animate-spin" />
                          ) : (
                            "Reject"
                          )}
                        </Button>
                      </>
                    )}
                    {status === "paid" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!loading}
                        className="rounded-full border-emerald-300 text-emerald-700 text-xs hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300"
                        onClick={() => updateStatus(l.id, "submitted")}
                      >
                        {loading === l.id + "submitted" ? (
                          <LoaderCircle className="size-3 animate-spin" />
                        ) : (
                          "Submitted to Bags.fm"
                        )}
                      </Button>
                    )}
                    {l.mint_address && (
                      <a
                        href={`https://bags.fm/${l.mint_address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="sm" variant="ghost" className="rounded-full px-2">
                          <ExternalLink className="size-3" />
                        </Button>
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {launches.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No launch requests.
        </p>
      )}
    </div>
  );
}

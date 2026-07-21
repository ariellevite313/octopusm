"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function AdminWithdrawalNavLink() {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch("/api/admin/withdrawals", { cache: "no-store" });
        if (!res.ok) return;
        const { withdrawals } = await res.json() as { withdrawals: Array<{ status: string }> };
        setPending((withdrawals ?? []).filter((w) => w.status === "pending").length);
      } catch { /* silent */ }
    }
    void fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Link
      href="/admin/withdrawals"
      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <ArrowUpRight className="size-4" />
      Withdrawals
      {pending > 0 && (
        <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          {pending > 9 ? "9+" : pending}
        </span>
      )}
    </Link>
  );
}

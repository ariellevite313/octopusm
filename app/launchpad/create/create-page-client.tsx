"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CreateTokenWizard } from "@/components/launchpad/create-token-wizard";
import { useAuth } from "@/providers/auth-provider";

type Chain = "solana" | "arc";

export function CreatePageClient({
  initialData,
}: {
  initialData?: Record<string, unknown>;
}) {
  const { selectedChain } = useAuth();
  const [chain, setChain] = useState<Chain>(selectedChain === "arc" ? "arc" : "solana");

  // Sync automatique quand le wallet connecté change
  useEffect(() => {
    setChain(selectedChain === "arc" ? "arc" : "solana");
  }, [selectedChain]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/launchpad"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Launchpad
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Launch a Token</h1>
        <p className="text-sm text-muted-foreground">
          {chain === "solana"
            ? "Launch your token on Solana"
            : "Launch your token on Arc (USDC-native L1)"}
        </p>
      </div>

      {/* Chain selector */}
      <div className="mb-6 flex items-center gap-1.5 rounded-2xl border border-border bg-muted/30 p-1.5">
        <button
          type="button"
          onClick={() => setChain("solana")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
            chain === "solana"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {/* Solana gradient dot */}
          <span className="size-3.5 rounded-full bg-gradient-to-br from-[#9945FF] to-[#14F195]" />
          Solana
        </button>
        <button
          type="button"
          onClick={() => setChain("arc")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
            chain === "arc"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex size-3.5 items-center justify-center rounded-full bg-blue-500 text-[8px] font-bold text-white">A</span>
          Arc
          <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-500">
            Testnet
          </span>
        </button>
      </div>

      <CreateTokenWizard
        chain={chain}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialData={initialData as any}
      />
    </main>
  );
}

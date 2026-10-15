"use client";

import { useState, useEffect } from "react";
import { CreateTokenWizard } from "@/components/launchpad/create-token-wizard";
import { useAuth } from "@/providers/auth-provider";

type Chain = "solana" | "arc";

export function CreatePageClient({
  initialData,
}: {
  initialData?: Record<string, unknown>;
}) {
  const { selectedChain, isAuthenticated } = useAuth();
  const [chain, setChain] = useState<Chain>(selectedChain === "arc" ? "arc" : "solana");

  // Sync automatique quand le wallet connecté change
  useEffect(() => {
    setChain(selectedChain === "arc" ? "arc" : "solana");
  }, [selectedChain]);

  // Guard client-side — ouvre le modal wallet si non connecté
  useEffect(() => {
    if (!isAuthenticated) {
      window.dispatchEvent(new CustomEvent("open-wallet-connect"));
    }
  }, [isAuthenticated]);

  return (
    <main className="mx-auto max-w-xl px-4 pb-8 pt-4">
      <CreateTokenWizard
        chain={chain}
        onChainChange={setChain}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialData={initialData as any}
      />
    </main>
  );
}

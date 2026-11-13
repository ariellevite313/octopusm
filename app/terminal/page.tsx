import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isRemovedToken } from "@/lib/removed-tokens";
import { Terminal } from "@/components/terminal/terminal";

export const metadata: Metadata = {
  title: "Terminal | OMdotfun",
  description: "Find any Solana token, see its chart and trade it on OMdotfun.",
  alternates: { canonical: "https://omdot.fun/terminal" },
};

export default async function TerminalPage({ searchParams }: { searchParams: Promise<{ mint?: string }> }) {
  const { mint } = await searchParams;
  if (isRemovedToken(mint)) redirect("/terminal");
  return <Suspense><Terminal /></Suspense>;
}

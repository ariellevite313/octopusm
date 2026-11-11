import type { Metadata } from "next";
import { Suspense } from "react";
import { Terminal } from "@/components/terminal/terminal";

export const metadata: Metadata = {
  title: "Terminal | OMdotfun",
  description: "Find any Solana token, see its chart and trade it on OMdotfun.",
  alternates: { canonical: "https://omdot.fun/terminal" },
};

export default function TerminalPage() {
  return <Suspense><Terminal /></Suspense>;
}

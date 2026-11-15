import type { Metadata } from "next";
import { Drc20List } from "@/components/drc20/drc20-list";

export const metadata: Metadata = {
  title: "DRC-20 | OMdotfun",
  description: "Dogecoin DRC-20 tokens on OMdotfun: holders, mint progress and activity.",
  alternates: { canonical: "https://omdot.fun/drc20" },
};

export default function Drc20Page() {
  return <Drc20List />;
}

import type { Metadata } from "next";
import GuideContent from "@/components/guide/guide-content";

export const metadata: Metadata = {
  title: "User guide",
  description: "How to use OMdot.fun step by step: account, feed, communities, Terminal, launchpad, predictions, Omero and AI agents.",
  alternates: { canonical: "https://omdot.fun/guide" },
};

export default function GuidePage() {
  return <GuideContent />;
}

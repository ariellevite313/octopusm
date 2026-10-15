import type { Metadata } from "next";
import FaqContent from "@/components/faq/faq-content";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about OMdot.fun — prediction markets, launchpad, fees, wallets, verification badge, and Omero rewards.",
  alternates: { canonical: "https://omdot.fun/faq" },
};

export default function FaqPage() {
  return <FaqContent />;
}

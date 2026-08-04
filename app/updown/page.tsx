import type { Metadata } from "next";
import { UpDownSection } from "@/components/updown/updown-cards";

export const metadata: Metadata = {
  title: "Up/Down Markets | OMdotfun",
  description: "Predict whether crypto prices go up or down. Short-term rounds on BTC, ETH, SOL and more.",
  robots: { index: true, follow: true },
};

export const revalidate = 30;

export default function UpDownPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <UpDownSection />
    </div>
  );
}

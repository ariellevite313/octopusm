import type { Metadata } from "next";
import { Discover } from "@/components/discover/discover";

export const metadata: Metadata = { title: "Discover", description: "Trending tokens, new launches and hot predictions on OMdotfun." };

export default function DiscoverPage() {
  return (
    <div className="mx-auto max-w-xl px-4 pb-32 pt-4 sm:max-w-3xl sm:px-6 md:max-w-4xl lg:max-w-6xl lg:px-8 lg:pt-6">
      <Discover />
    </div>
  );
}

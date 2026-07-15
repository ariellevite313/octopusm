import type { Metadata } from "next";
import { UpDownDetail } from "@/components/updown/updown-detail";

export const metadata: Metadata = {
  title: "Up/Down | Octopus Market",
  description: "Bet on crypto price direction.",
};

export default async function CryptoRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UpDownDetail marketId={id} />;
}

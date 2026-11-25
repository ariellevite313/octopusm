import type { Metadata } from "next";
import { NftView } from "@/components/nft/nft-view";

export const metadata: Metadata = { title: "NFT", description: "Your Solana NFTs and popular collections." };

export default function NftPage() {
  return (
    <div className="mx-auto max-w-xl px-4 pb-32 pt-6 lg:max-w-6xl lg:px-8">
      <NftView />
    </div>
  );
}

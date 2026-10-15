"use client";

import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { CommentsSection } from "@/components/shared/comments-section";
import type { MarketCommentEnriched } from "@/lib/supabase/types";

type Props = {
  tokenId: string;
  initialComments: MarketCommentEnriched[];
  isAuthenticated: boolean;
  walletAddress?: string | null;
};

export function LaunchpadComments({ tokenId, initialComments, isAuthenticated, walletAddress }: Props) {
  const { tr } = useT();
  return (
    <CommentsSection
      marketId={tokenId}
      initialComments={initialComments}
      isAuthenticated={isAuthenticated}
      walletAddress={walletAddress}
      apiBase="/api/launchpad"
      onRequestConnect={() => toast.error(tr("Connect your wallet to comment"))}
    />
  );
}

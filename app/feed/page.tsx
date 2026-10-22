import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedClient } from "@/components/social/feed-client";
import { FeedRightRail } from "@/components/social/feed-right-rail";

export const metadata: Metadata = { title: "Feed", description: "Posts from the OMdotfun community." };

// Grand écran : fil au centre entre deux bordures, tendances et comptes à suivre à droite
export default function FeedPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1000px] justify-center">
      <div className="min-h-screen w-full min-w-0 max-w-xl border-border lg:border-x xl:max-w-[600px]">
        <Suspense fallback={null}><FeedClient /></Suspense>
      </div>
      <FeedRightRail />
    </div>
  );
}

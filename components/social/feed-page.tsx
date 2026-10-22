import { Suspense } from "react";
import { FeedClient } from "@/components/social/feed-client";
import { FeedRightRail } from "@/components/social/feed-right-rail";

/** Fil : au centre entre deux bordures ; tendances et comptes à suivre à droite sur grand écran. */
export function FeedPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1000px] justify-center">
      <div className="min-h-screen w-full min-w-0 max-w-xl border-border lg:border-x xl:max-w-[600px]">
        <h1 className="sr-only">OMdotfun feed</h1>
        <Suspense fallback={null}><FeedClient /></Suspense>
      </div>
      <FeedRightRail />
    </div>
  );
}

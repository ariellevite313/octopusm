import { Suspense } from "react";
import { FeedClient } from "@/components/social/feed-client";
import { FeedRightRail } from "@/components/social/feed-right-rail";
import { HackathonTicker } from "@/components/hackathon/hackathon-ticker";

/** Fil : collé au menu (une seule ligne de séparation, celle du menu) ; tendances et comptes à suivre à droite sur grand écran. */
export function FeedPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1000px] justify-center lg:mx-0 lg:justify-start">
      <div className="min-h-screen w-full min-w-0 max-w-xl border-border lg:border-r xl:max-w-[600px]">
        <h1 className="sr-only">OMdotfun feed</h1>
        <HackathonTicker />
        <Suspense fallback={null}><FeedClient /></Suspense>
      </div>
      <FeedRightRail />
    </div>
  );
}

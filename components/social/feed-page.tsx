import { Suspense } from "react";
import { FeedClient } from "@/components/social/feed-client";
import { FeedRightRail } from "@/components/social/feed-right-rail";
import { HackathonTicker } from "@/components/hackathon/hackathon-ticker";
import { FeedTokens } from "@/components/social/feed-tokens";

/** Fil : collé au menu (une seule ligne de séparation, celle du menu) ; tendances et comptes à suivre à droite,
 *  puis la colonne « Tokens en tendance ». */
export function FeedPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1000px] justify-center lg:mx-0 lg:max-w-none lg:justify-start">
      <div className="min-h-screen w-full min-w-0 max-w-xl border-border lg:border-r xl:max-w-[600px]">
        <h1 className="sr-only">OMdotfun feed</h1>
        <HackathonTicker />
        <Suspense fallback={null}><FeedClient /></Suspense>
      </div>
      <FeedRightRail />
      {/* Colonne à part « Tokens en tendance », dans la place libre à droite (pas mêlée aux tendances ni aux comptes à suivre) */}
      <aside className="sticky top-0 hidden h-screen w-[300px] shrink-0 overflow-y-auto scrollbar-none py-3 pl-5 pr-4 xl:block">
        <FeedTokens />
      </aside>
    </div>
  );
}

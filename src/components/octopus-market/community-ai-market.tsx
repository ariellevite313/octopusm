import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Globe, ShieldAlert, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  readAIListings,
  subscribeToAIListings,
  trackAIListingVisit,
  type AIListingSubmission,
} from "@/components/octopus-market/ai-listing-store";
import { AIToolSocialPanel } from "@/components/octopus-market/ai-tool-social-panel";

type CommunityAIMarketProps = {
  actorKey: string;
  actorLabel: string;
};

export function CommunityAIMarket({ actorKey, actorLabel }: CommunityAIMarketProps) {
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    return subscribeToAIListings(() => {
      setRefreshIndex((currentValue) => currentValue + 1);
    });
  }, []);

  const visibleListings = useMemo<AIListingSubmission[]>(() => {
    return readAIListings().filter((listing) => listing.visibleInExplore && listing.status !== "rejected");
  }, [refreshIndex]);

  if (visibleListings.length === 0) {
    return null;
  }

  return (
    <div className="mt-10 space-y-5">
      <div className="rounded-3xl border border-orange-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-950/70">
        <div className="flex flex-wrap items-center gap-3">
          <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
            Community AI submissions
          </Badge>
          <Badge className="border border-orange-200 bg-white text-zinc-700 hover:bg-white dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-900">
            Visible immediately in Explore AI
          </Badge>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-400">
          Newly submitted AI products appear here right away, while admin review, blue badge activation, and moderation still stay available in the admin interface.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {visibleListings.map((listing) => (
          <Card key={listing.id} className="border-orange-200 bg-white text-zinc-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img src={listing.iconSrc} alt={listing.displayName} className="size-12 rounded-2xl object-cover" />
                  <div>
                    <CardTitle className="text-xl">{listing.displayName}</CardTitle>
                    <CardDescription className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      {listing.twitterHandle || "No X profile"}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex flex-col gap-2 text-right">
                  <Badge className="border border-orange-200 bg-white text-orange-700 hover:bg-white dark:border-white/10 dark:bg-zinc-900 dark:text-orange-300 dark:hover:bg-zinc-900">
                    {listing.planId === "free" ? "Free" : listing.planId === "starter" ? "Starter" : "Builder"}
                  </Badge>
                  <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                    {listing.status}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-7 text-zinc-600 dark:text-zinc-400">{listing.description}</p>
              <div className="grid gap-2 text-sm text-zinc-700 dark:text-zinc-300 sm:grid-cols-2">
                <div className="rounded-2xl border border-orange-100 bg-orange-50/80 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Visitors</p>
                  <p className="mt-2 font-semibold text-zinc-950 dark:text-white">{listing.visitorCount}</p>
                </div>
                <div className="rounded-2xl border border-orange-100 bg-orange-50/80 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Listing status</p>
                  <p className="mt-2 font-semibold text-zinc-950 dark:text-white">{listing.status}</p>
                </div>
              </div>
              <AIToolSocialPanel
                toolName={`ai-listing:${listing.id}:${listing.displayName}`}
                actorKey={actorKey}
                actorLabel={actorLabel}
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  asChild
                  className="rounded-2xl bg-orange-500 text-white hover:bg-orange-400"
                  onClick={() => {
                    trackAIListingVisit(listing.id, actorKey);
                  }}
                >
                  <a href={listing.websiteUrl} target="_blank" rel="noreferrer">
                    Open AI website
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="rounded-2xl border-orange-200 bg-white text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
                >
                  <a href={listing.socialUrl} target="_blank" rel="noreferrer">
                    Social profile
                    <Globe className="size-4" />
                  </a>
                </Button>
              </div>
              <div className="rounded-2xl border border-orange-100 bg-orange-50/80 px-4 py-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                <div className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-orange-500 dark:text-orange-300" />
                  <span>
                    Admin review still applies. Blue badge activation stays manual, and gold badge remains locked until the long-term requirement is met.
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

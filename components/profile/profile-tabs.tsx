"use client";

import { useState } from "react";
import type { ActivityItem, CreatedToken, CreatedMarket } from "@/services/profile-service";
import { ProfileActivityList } from "./profile-activity-list";
import { ProfileTokensList } from "./profile-tokens-list";
import { ProfileMarketsList } from "./profile-markets-list";
import { useT } from "@/lib/i18n";

type Tab = "activity" | "tokens" | "markets";

/** One scrollable tab row: Recent activity / Tokens launched / Markets created. */
export function ProfileTabs({
  activity, volume, tokens, markets,
}: {
  activity: ActivityItem[];
  volume: { usdc: number; clt: number };
  tokens: CreatedToken[];
  markets: CreatedMarket[];
}) {
  const { tr } = useT();
  const tabs: { id: Tab; label: string }[] = [
    ...(activity.length ? [{ id: "activity" as const, label: tr("Recent activity") }] : []),
    ...(tokens.length ? [{ id: "tokens" as const, label: tr("Tokens launched") }] : []),
    ...(markets.length ? [{ id: "markets" as const, label: tr("Markets created") }] : []),
  ];
  const [tab, setTab] = useState<Tab | null>(null);
  if (tabs.length === 0) return null;
  const current = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;

  return (
    <div>
      <div
        role="tablist"
        className="mb-3 flex gap-5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={current === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 border-b-2 pb-1 text-lg font-bold tracking-tight transition-colors ${
              current === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current === "activity" && <ProfileActivityList items={activity} volume={volume} />}
      {current === "tokens" && <ProfileTokensList tokens={tokens} />}
      {current === "markets" && <ProfileMarketsList markets={markets} />}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import type { CreatedToken } from "@/services/profile-service";
import { fmt } from "@/lib/format";
import { ListPager } from "./list-pager";
import { useT } from "@/lib/i18n";

const PAGE_SIZE = 5;

function ChainBadge({ chain }: { chain: "solana" | "arc" }) {
  return (
    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
      {chain === "arc" ? "Arc" : "Solana"}
    </span>
  );
}

function Logo({ token }: { token: CreatedToken }) {
  if (token.logo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={token.logo_url} alt="" className="size-10 shrink-0 rounded-full bg-muted object-cover" />;
  }
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">
      {token.name.trim()[0]?.toUpperCase() ?? "T"}
    </div>
  );
}

export function ProfileTokensList({ tokens }: { tokens: CreatedToken[] }) {
  const { tr } = useT();
  const [page, setPage] = useState(0);
  if (tokens.length === 0) return null;

  const totalPages = Math.ceil(tokens.length / PAGE_SIZE);
  const slice = tokens.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <section>
      <h2 className="mb-3 text-lg font-bold tracking-tight text-foreground">{tr("Tokens launched")}</h2>
      <div className="overflow-hidden rounded-[22px] border border-border bg-card">
        {slice.map((t) => (
          <Link
            key={t.id}
            href={`/launchpad/${t.mint_address ?? t.id}`}
            className="flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40"
          >
            <Logo token={t} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-foreground">{t.name}</p>
              <p className="truncate text-[13px] text-muted-foreground">${t.ticker}</p>
            </div>
            <ChainBadge chain={t.chain} />
            <div className="w-20 shrink-0 text-right">
              <p className="text-[11px] text-muted-foreground">{tr("Market cap")}</p>
              <p className="num text-[14px] font-bold text-foreground">
                {t.market_cap_usd != null ? `$${fmt(t.market_cap_usd, 0)}` : "—"}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <ListPager page={page} total={totalPages} onChange={setPage} />
    </section>
  );
}

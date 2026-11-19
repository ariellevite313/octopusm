"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { TradeGainsResponse } from "@/app/api/dashboard/trade-gains/route";
import { useT } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { LOCALES } from "@/lib/i18n-mark";

type Tr = (s: string, v?: Record<string, string | number>) => string;

function timeAgo(iso: string, tr: Tr, lang: Lang) {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1)  return tr("just now");
  if (h < 24) return tr("{n}h ago", { n: h });
  const d = Math.floor(h / 24);
  if (d < 7)  return tr("{n}d ago", { n: d });
  return new Date(iso).toLocaleDateString(LOCALES[lang], { month: "short", day: "numeric", year: "numeric" });
}

const usd = (n: number) => `${n >= 1 ? n.toFixed(2) : n.toFixed(4)} $`;

/** Gains sur les achats de tokens : depuis tes posts et par parrainage. */
export function TradeGainsPanel() {
  const { tr, lang } = useT();
  const [data, setData] = useState<TradeGainsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/dashboard/trade-gains", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: TradeGainsResponse) => { if (alive) setData(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed) return <p className="py-6 text-sm text-muted-foreground">{tr("Could not load your gains.")}</p>;
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-muted/50" />;

  return (
    <section>
      <p className="num text-[44px] font-bold leading-none tracking-tight text-up">{usd(data.total)}</p>
      <p className="mt-1 text-[15px] text-muted-foreground">{tr("earned in total")}</p>
      <div className="mt-4 flex gap-10">
        <div>
          <p className="num text-xl font-bold text-foreground">{usd(data.fromPosts)}</p>
          <p className="text-[13px] text-muted-foreground">{tr("from your posts")}</p>
        </div>
        <div>
          <p className="num text-xl font-bold text-foreground">{usd(data.fromReferrals)}</p>
          <p className="text-[13px] text-muted-foreground">{tr("referrals")}</p>
        </div>
      </div>

      <div className="mt-4">
        {data.rows.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {tr("No gains yet. You earn when someone buys a token from one of your posts, or when someone you referred buys.")}
          </p>
        ) : data.rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3.5 py-3">
            {r.token?.logoUrl ? (
              <Image src={r.token.logoUrl} alt="" width={52} height={52} className="size-[52px] shrink-0 rounded-2xl object-cover" unoptimized />
            ) : (
              <span className="flex size-[52px] shrink-0 items-center justify-center rounded-2xl bg-muted text-sm font-bold text-muted-foreground">
                {(r.token?.ticker ?? "?").slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-semibold text-foreground">{r.token?.name ?? "-"}</p>
              <p className="truncate text-[13px] text-muted-foreground">
                {r.kind === "post" ? tr("Purchase from your post") : tr("Purchase by someone you referred")} · {timeAgo(r.createdAt, tr, lang)}
              </p>
            </div>
            <p className="num shrink-0 text-[16px] font-bold text-up">+{usd(r.amount)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

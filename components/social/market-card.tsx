"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Clock } from "lucide-react";
import type { SharedMarket } from "@/lib/social/posts";
import { useT } from "@/lib/i18n";
import { LivePrice } from "./live-price";

/** Marché OMdotfun partagé dans un post : titre, vrais boutons d'options, prix en direct si c'est un marché sur une crypto. */
export function MarketCard({ m }: { m: SharedMarket }) {
  const { tr } = useT();
  const router = useRouter();
  const closes = m.closes_at ? new Date(m.closes_at) : null;
  const open = m.status === "active";
  const ids = m.option_ids ?? [];
  const tone = (i: number, n: number) =>
    n === 2 && i === 0 ? "bg-up text-white hover:opacity-90" : n === 2 && i === 1 ? "bg-down text-white hover:opacity-90" : "bg-foreground text-background hover:opacity-90";

  return (
    <div className="mt-3">
      <Link href={m.href} className="flex items-center gap-3">
        {m.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.image} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BarChart3 className="size-6" /></span>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[15px] font-bold leading-snug text-foreground">{m.title}</p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            {m.pool && <span className="num font-semibold text-foreground">{m.pool}</span>}
            {closes && open && <span className="flex items-center gap-1"><Clock className="size-3" />{closes.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>}
            {!open && <span className="capitalize">{tr(m.status)}</span>}
          </p>
        </div>
      </Link>

      {m.price_ticker && <LivePrice symbol={m.price_ticker} target={m.price_target ?? null} targetLabel={tr("Market target")} />}

      {open && m.options.length > 0 && (
        <div className={`mt-3 grid gap-2 ${m.options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {m.options.map((o, i) => (
            <button
              key={o + i}
              onClick={() => router.push(`${m.href}?option=${encodeURIComponent(ids[i] ?? "")}`)}
              className={`h-11 truncate rounded-full px-3 text-[15px] font-bold transition-opacity ${tone(i, m.options.length)}`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

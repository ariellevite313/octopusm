"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Clock } from "lucide-react";
import type { SharedMarket } from "@/lib/social/posts";
import { useT } from "@/lib/i18n";
import { LivePrice } from "./live-price";

/** Marché OMdotfun partagé dans un post : titre, vrais boutons d'options, prix en direct si c'est un marché sur une crypto. */
export function MarketCard({ m, postId }: { m: SharedMarket; postId?: string }) {
  const { tr } = useT();
  const router = useRouter();
  const closes = m.closes_at ? new Date(m.closes_at) : null;
  const open = m.status === "active";
  const ids = m.option_ids ?? [];
  const via = postId ? `via=${postId}` : "";
  const go = (i: number) => router.push(`${m.href}?option=${encodeURIComponent(ids[i] ?? "")}${via ? `&${via}` : ""}`);
  // Boutons en verre : teinte transparente, bord fin, flou
  const glass = "backdrop-blur-md transition-colors";
  const yes = `${glass} border border-up/40 bg-up/15 text-up hover:bg-up/25`;
  const no = `${glass} border border-down/40 bg-down/15 text-down hover:bg-down/25`;
  const neutral = `${glass} border border-foreground/15 bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.12]`;
  const many = m.options.length > 2;
  const shown = many ? m.options.slice(0, 4) : m.options;
  const rest = m.options.length - shown.length;

  return (
    <div className="mt-3">
      <Link href={via ? `${m.href}?${via}` : m.href} className="flex items-center gap-3">
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
        many ? (
          <div className="mt-3 space-y-2">
            {shown.map((o, i) => (
              <button key={o + i} onClick={() => go(i)} className={`flex h-11 w-full items-center justify-between rounded-full px-4 text-[15px] font-semibold ${neutral}`}>
                <span className="truncate">{o}</span>
                <span className="ml-3 shrink-0 text-xs font-bold text-primary">{tr("Bet")}</span>
              </button>
            ))}
            {rest > 0 && (
              <Link href={via ? `${m.href}?${via}` : m.href} className="block pt-1 text-center text-sm font-semibold text-muted-foreground hover:text-foreground">
                {tr("+{n} more options", { n: rest })}
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {m.options.map((o, i) => (
              <button key={o + i} onClick={() => go(i)} className={`h-11 truncate rounded-full px-3 text-[15px] font-bold ${i === 0 ? yes : no}`}>
                {o}
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}

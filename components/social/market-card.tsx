import Link from "next/link";
import { BarChart3, Clock } from "lucide-react";
import type { SharedMarket } from "@/lib/social/posts";

/** Carte d'un marché OMdotfun partagé dans un post. */
export function MarketCard({ m }: { m: SharedMarket }) {
  const closes = m.closes_at ? new Date(m.closes_at) : null;
  return (
    <Link href={m.href} className="mt-3 flex gap-3 rounded-2xl border border-border p-3 transition-colors hover:bg-muted/40">
      {m.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.image} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BarChart3 className="size-7" /></span>
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">{m.title}</p>
        {m.options.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {m.options.map((o) => <span key={o} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">{o}</span>)}
          </div>
        )}
        <p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          {m.pool && <span className="num font-semibold text-foreground">{m.pool}</span>}
          {closes && m.status === "active" && <span className="flex items-center gap-1"><Clock className="size-3" />{closes.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>}
          {m.status !== "active" && <span className="capitalize">{m.status}</span>}
        </p>
      </div>
    </Link>
  );
}

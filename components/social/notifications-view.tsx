"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";
import { renderAnnouncement } from "@/lib/hackathon/announcements";
import { Mirage } from "@/components/shared/mirage";

type Ann = { id: string; template: string; vars: Record<string, string | number>; href: string | null; publish_at: string; read: boolean };

const money = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`);
type N = { id: string; kind: "follow" | "mention" | "reply" | "like" | "repost" | "quote" | "reply_like" | "reply_reply" | "tip" | "chill" | "weekly_box" | "ambassador" | "price_alert" | "wallet_trade" | "rug_alert" | "referral_gain" | "referral_recap"; actor: string; data?: { reason?: string; before?: number; now?: number; soldPct?: number; symbol?: string | null; mcap?: number; value?: number; kind?: string; chain?: string; label?: string | null; side?: string; mint?: string; usd?: number | null; amount?: number; clt?: number; friends?: number } | null; actor_name: string | null; actor_avatar: string | null; post_id: string | null; excerpt: string | null; read: boolean; created_at: string };

function ago(iso: string, tr: (s: string, v?: Record<string, string | number>) => string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return tr("just now");
  if (s < 3600) return tr("{n}m ago", { n: Math.floor(s / 60) });
  if (s < 86400) return tr("{n}h ago", { n: Math.floor(s / 3600) });
  return tr("{n}d ago", { n: Math.floor(s / 86400) });
}

export function NotificationsView() {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [list, setList] = useState<N[] | null>(null);
  const [anns, setAnns] = useState<Ann[]>([]);

  useEffect(() => {
    if (!isAuthenticated) { setList([]); return; }
    let off = false;
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (off) return;
        setList(j.notifications ?? []);
        setAnns(j.announcements ?? []);
        // Ouvrir la page = tout est lu
        fetch("/api/notifications", { method: "POST" }).then(() => window.dispatchEvent(new CustomEvent("notifications-read"))).catch(() => {});
      })
      .catch(() => !off && setList([]));
    return () => { off = true; };
  }, [isAuthenticated]);

  const text = (n: N) =>
    n.kind === "follow" ? tr("started following you")
    : n.kind === "mention" ? tr("mentioned you in a post")
    : n.kind === "reply" ? tr("replied to your post")
    : n.kind === "repost" ? tr("reposted your post")
    : n.kind === "quote" ? tr("quoted your post")
    : n.kind === "reply_reply" ? tr("replied to your reply")
    : n.kind === "reply_like" ? tr("liked your reply")
    : n.kind === "tip" ? tr("sent you OMERO on your post")
    : n.kind === "chill" ? tr("traded through your bag, you earned 40% of the fee")
    : n.kind === "weekly_box" ? tr("your weekly box result is in. Your OMERO is credited.")
    : n.kind === "price_alert" ? tr(n.data?.kind === "mcap_below" ? "fell below {v} market cap" : "went above {v} market cap", { v: money(n.data?.value ?? 0) })
    : n.kind === "wallet_trade" ? tr(n.data?.side === "buy" ? "bought {token}{usd}" : "sold {token}{usd}", { token: `$${n.data?.symbol ?? "token"}`, usd: n.data?.usd ? ` (${money(n.data.usd)})` : "" })
    : n.kind === "rug_alert" ? (n.data?.reason === "liquidity" ? tr("Rug alert: liquidity fell from {a} to {b}. You hold this token.", { a: money(n.data?.before ?? 0), b: money(n.data?.now ?? 0) })
      : n.data?.reason === "dev_sold_all" ? tr("Rug alert: the dev sold everything. You hold this token.")
      : n.data?.reason === "dev_selling" ? tr("Rug alert: the dev is selling. You hold this token.")
      : tr("Rug alert: flagged as rugged by RugCheck. You hold this token."))
    : n.kind === "referral_gain" ? (n.data?.clt ? tr("your referral earned you {v} CLT", { v: Number(n.data.clt).toLocaleString() }) : tr("your referral earned you {v}", { v: `$${Number(n.data?.usd ?? 0) >= 0.01 ? Number(n.data?.usd ?? 0).toFixed(2) : Number(n.data?.usd ?? 0).toFixed(4)}` }))
    : n.kind === "referral_recap" ? tr("this week your referrals earned you {v} from {n} friends", { v: `$${Number(n.data?.usd ?? 0).toFixed(2)}`, n: n.data?.friends ?? 0 })
    : n.kind === "ambassador" ? tr("you are now an OMdotfun ambassador. You earn 20% of the fees on your referrals.")
    : tr("liked your post");

  return (
    <div className="mx-auto max-w-xl pb-32">
      <div className="sticky top-16 z-10 lg:top-0 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <h1 className="text-base font-bold">{tr("Notifications")}</h1>
      </div>
      {!isAuthenticated ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{tr("Connect your wallet to see your notifications.")}</p>
      ) : list === null ? (
        <div className="flex justify-center py-16"><Mirage className="size-5 text-muted-foreground" /></div>
      ) : list.length === 0 && anns.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{tr("Nothing yet.")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {anns.map((a) => {
            const t = renderAnnouncement(a.template, a.vars, tr);
            return (
              <li key={a.id} className={`flex gap-3 px-4 py-3.5 ${a.read ? "" : "bg-muted/30"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/omdot-icon.png" alt="" className="size-10 shrink-0 rounded-full bg-muted object-cover p-1" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold text-foreground">{t.title} <span className="text-xs font-normal text-muted-foreground">{ago(a.publish_at, tr)}</span></p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t.body}</p>
                  {a.href && <Link href={a.href} className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-foreground px-5 text-sm font-bold text-background">{t.cta}</Link>}
                </div>
              </li>
            );
          })}
          {list.map((n) => {
            const box = n.kind === "weekly_box" || n.kind === "ambassador" || n.kind === "referral_recap" || n.kind === "price_alert" || n.kind === "rug_alert";
            const term = n.kind === "price_alert" || n.kind === "wallet_trade" || n.kind === "rug_alert";
            const name = n.kind === "price_alert" || n.kind === "rug_alert" ? `$${n.data?.symbol ?? "Token"}` : n.kind === "wallet_trade" ? (n.data?.label ?? shortAddress(n.actor)) : box ? "OMdotfun" : n.actor_name ?? shortAddress(n.actor);
            const tmint = n.kind === "price_alert" || n.kind === "rug_alert" ? n.actor : n.data?.mint ?? "";
            const tchain = n.data?.chain && n.data.chain !== "solana" ? `chain=${n.data.chain}&` : "";
            // Alerte de prix ou rug sur Solana : le lien ouvre directement la vente (stop-loss / take-profit en un geste)
            const sellQ = (n.kind === "price_alert" || n.kind === "rug_alert") && !tchain ? "&sell=1" : "";
            const href = term ? `/terminal?${tchain}mint=${tmint}${sellQ}` : n.kind === "ambassador" ? "/ambassadors" : n.kind === "referral_gain" || n.kind === "referral_recap" ? "/dashboard/referrals" : box ? "/dashboard/box" : n.post_id ? `/post/${n.post_id}` : `/profile/${n.actor}`;
            return (
              <li key={n.id}>
                <Link href={href} className={`flex gap-3 px-4 py-3.5 hover:bg-muted/40 ${n.read ? "" : "bg-muted/30"}`}>
                  {box ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src="/omdot-icon.png" alt="" className="size-10 shrink-0 rounded-full bg-muted object-cover p-1" />
                  ) : n.actor_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.actor_avatar} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{name[0]?.toUpperCase()}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] text-foreground"><span className="font-bold">{name}</span> {text(n)}</p>
                    {n.excerpt && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{n.excerpt}</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground">{ago(n.created_at, tr)}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

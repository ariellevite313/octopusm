"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";
import { renderAnnouncement } from "@/lib/hackathon/announcements";

type Ann = { id: string; template: string; vars: Record<string, string | number>; href: string | null; publish_at: string; read: boolean };

type N = { id: string; kind: "follow" | "mention" | "reply" | "like" | "repost" | "quote" | "reply_like" | "reply_reply"; actor: string; actor_name: string | null; actor_avatar: string | null; post_id: string | null; excerpt: string | null; read: boolean; created_at: string };

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
    : tr("liked your post");

  return (
    <div className="mx-auto max-w-xl pb-32">
      <div className="sticky top-16 z-10 lg:top-0 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <h1 className="text-base font-bold">{tr("Notifications")}</h1>
      </div>
      {!isAuthenticated ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{tr("Connect your wallet to see your notifications.")}</p>
      ) : list === null ? (
        <div className="flex justify-center py-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
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
            const name = n.actor_name ?? shortAddress(n.actor);
            const href = n.post_id ? `/post/${n.post_id}` : `/profile/${n.actor}`;
            return (
              <li key={n.id}>
                <Link href={href} className={`flex gap-3 px-4 py-3.5 hover:bg-muted/40 ${n.read ? "" : "bg-muted/30"}`}>
                  {n.actor_avatar ? (
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

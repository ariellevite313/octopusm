"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Rocket, BarChart3 } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";

type Item = {
  id: string; type: string; actor: string; title: string; link: string;
  created_at: string; read_at: string | null; actor_name: string | null; actor_avatar: string | null;
};

function ago(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function NotificationsPage() {
  const { tr } = useT();
  const { isAuthenticated, walletAddress } = useAuth();
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    if (!isAuthenticated) { setItems([]); return; }
    let alive = true;
    fetch("/api/notifications", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (!alive) return;
        const list: Item[] = d.items ?? [];
        setItems(list);
        if ((d.unread ?? 0) > 0) {
          fetch("/api/notifications/read", { method: "POST" })
            .then(() => window.dispatchEvent(new CustomEvent("notifications-read")))
            .catch(() => {});
        }
      })
      .catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [isAuthenticated, walletAddress]);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-foreground">{tr("Notifications")}</h1>

      {!isAuthenticated ? (
        <p className="py-16 text-center text-muted-foreground">{tr("Connect your wallet to see notifications.")}</p>
      ) : items === null ? (
        <div className="flex justify-center py-16"><div className="size-7 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{tr("No notifications yet. Follow creators to get notified when they launch a token or open a market.")}</p>
      ) : (
        <div className="divide-y divide-border">
          {items.map(n => {
            const name = n.actor_name ?? shortAddress(n.actor);
            const isToken = n.type === "token_launched";
            return (
              <Link key={n.id} href={n.link} className="flex items-center gap-3 py-3.5">
                {n.actor_avatar ? (
                  <Image src={n.actor_avatar} alt="" width={40} height={40} className="size-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                    {isToken ? <Rocket className="size-5" /> : <BarChart3 className="size-5" />}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] text-foreground">
                    <span className="font-bold">{name}</span>{" "}
                    <span className="text-muted-foreground">{isToken ? tr("launched a token") : tr("created a market")}</span>
                  </p>
                  <p className="truncate text-[14px] font-semibold text-foreground">{n.title}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-[12px] text-muted-foreground">{ago(n.created_at)}</span>
                  {!n.read_at && <span className="size-2 rounded-full bg-primary" />}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

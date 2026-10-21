"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";

/** Cloche avec pastille de non-lus ; lien vers /notifications. Visible uniquement connecté. */
export function NotificationBell({ className = "" }: { className?: string }) {
  const { isAuthenticated, walletAddress } = useAuth();
  const { tr } = useT();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || !walletAddress) { setUnread(0); return; }
    let alive = true;
    const load = () => {
      fetch("/api/notifications", { cache: "no-store" })
        .then(r => r.json())
        .then(d => { if (alive) setUnread(Number(d.unread ?? 0)); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 60_000);
    const onRead = () => setUnread(0);
    window.addEventListener("notifications-read", onRead);
    return () => { alive = false; clearInterval(id); window.removeEventListener("notifications-read", onRead); };
  }, [isAuthenticated, walletAddress]);

  if (!isAuthenticated) return null;

  return (
    <Link
      href="/notifications"
      title={tr("Notifications")}
      aria-label={tr("Notifications")}
      className={`relative flex items-center justify-center ${className}`}
    >
      <Bell className="size-[22px]" strokeWidth={1.75} />
      {unread > 0 && (
        <span className="num absolute right-0.5 top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}

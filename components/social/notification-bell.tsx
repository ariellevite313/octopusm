"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";

/** Cloche des notifications : un point quand il y en a de non lues (vérifié toutes les minutes). */
export function NotificationBell({ className = "", iconClass = "size-[22px]" }: { className?: string; iconClass?: string }) {
  const { isAuthenticated } = useAuth();
  const { tr } = useT();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) { setUnread(0); return; }
    let off = false;
    const load = () => fetch("/api/notifications?count=1", { cache: "no-store" }).then((r) => r.json()).then((j) => !off && setUnread(j.unread ?? 0)).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    const onRead = () => setUnread(0);
    window.addEventListener("notifications-read", onRead);
    return () => { off = true; clearInterval(t); window.removeEventListener("notifications-read", onRead); };
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;
  return (
    <Link href="/notifications" aria-label={tr("Notifications")} title={tr("Notifications")} className={`relative flex items-center justify-center ${className}`}>
      <Bell className={iconClass} strokeWidth={1.75} />
      {unread > 0 && <span className="absolute right-1 top-1 size-2.5 rounded-full bg-down ring-2 ring-background" />}
    </Link>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";

/** Nombre de notifications non lues (vérifié toutes les minutes, remis à 0 quand on les lit). */
export function useUnreadNotifications(): number {
  const { isAuthenticated } = useAuth();
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
  return unread;
}

/** Cloche des notifications : un point quand il y en a de non lues. */
export function NotificationBell({ className = "", iconClass = "size-[22px]", children }: { className?: string; iconClass?: string; children?: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { tr } = useT();
  const unread = useUnreadNotifications();
  if (!isAuthenticated) return null;
  return (
    <Link href="/notifications" aria-label={tr("Notifications")} title={tr("Notifications")} className={`relative flex items-center justify-center ${className}`}>
      <span className="relative flex shrink-0">
        <Bell className={iconClass} strokeWidth={1.75} />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-down ring-2 ring-background" />}
      </span>
      {children}
    </Link>
  );
}

/** Ligne « Notifications » du menu téléphone, avec le nombre de non lues. */
export function NotificationMenuLink({ active, onClick }: { active: boolean; onClick: () => void }) {
  const { isAuthenticated } = useAuth();
  const { tr } = useT();
  const unread = useUnreadNotifications();
  if (!isAuthenticated) return null;
  return (
    <Link
      href="/notifications"
      onClick={onClick}
      className={`flex items-center justify-between rounded-2xl px-4 py-3.5 text-[15px] font-semibold transition-colors hover:bg-muted hover:text-foreground ${active ? "bg-muted text-foreground" : "text-muted-foreground"}`}
    >
      {tr("Notifications")}
      {unread > 0 && <span className="min-w-6 rounded-full bg-down px-2 py-0.5 text-center text-xs font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
    </Link>
  );
}

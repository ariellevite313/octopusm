"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { ChevronLeft, ChevronRight, Moon, Settings, Sun, X } from "lucide-react";
import { LANGS, useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";
import { MORE_ITEMS } from "@/lib/nav/more-items";
import { useAuth } from "@/providers/auth-provider";

const row = "flex items-center justify-between rounded-2xl px-4 py-3.5 text-[15px] font-semibold transition-colors hover:bg-muted hover:text-foreground";
const isOn = (href: string, pathname: string) => pathname === href || pathname.startsWith(href + "/");

/** Bas du menu : bouton Paramètres + thème clair / sombre (icônes seules). */
export function MenuFooter({ onSettings }: { onSettings: () => void }) {
  const { tr } = useT();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";
  return (
    <div className="flex items-center gap-2 border-t border-border p-3">
      <button type="button" onClick={onSettings} className="flex h-11 flex-1 items-center gap-2.5 rounded-2xl px-4 text-[15px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <Settings className="size-[18px]" strokeWidth={1.9} />
        {tr("Settings")}
      </button>
      <div className="flex gap-1 rounded-full bg-muted p-1">
        {([["light", Sun, T("Light")], ["dark", Moon, T("Dark")]] as const).map(([id, Icon, label]) => {
          const active = mounted && (id === "dark") === isDark;
          return (
            <button key={id} type="button" onClick={() => setTheme(id)} aria-label={tr(label)} title={tr(label)} aria-pressed={active}
              className={`flex size-9 items-center justify-center rounded-full transition-colors ${active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              <Icon className="size-4" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Panneau Paramètres du menu : liens secondaires, langue, et « Applications connectées » tout en bas. */
export function MenuSettingsPanel({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const { tr, lang, setLang } = useT();
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const items = [...MORE_ITEMS, { label: T("Archive"), description: "", href: "/archive", external: false }];
  return (
    <>
      <div className="flex h-16 items-center justify-between px-3">
        <button type="button" onClick={onBack} className="flex items-center gap-1 rounded-lg px-2 py-1 text-lg font-bold tracking-tight text-foreground hover:bg-muted">
          <ChevronLeft className="size-5" />{tr("Settings")}
        </button>
        <button onClick={onClose} aria-label={tr("Close menu")} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
        {items.map((item) => (
          <Link key={item.label} href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined} onClick={onClose}
            className={`${row} ${!item.external && isOn(item.href, pathname) ? "bg-muted text-foreground" : "text-muted-foreground"}`}>
            {tr(item.label)}
          </Link>
        ))}
        <div className="px-1 pb-1 pt-3">
          <p className="mb-2 text-[13px] font-semibold text-muted-foreground">{tr("Language")}</p>
          <div className="flex flex-wrap gap-1.5">
            {LANGS.map((l) => (
              <button key={l.code} type="button" onClick={() => setLang(l.code)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${lang === l.code ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                {l.short}
              </button>
            ))}
          </div>
        </div>
      </nav>
      {isAuthenticated && (
        <div className="border-t border-border p-3">
          <Link href="/settings/apps" onClick={onClose} className={`${row} ${isOn("/settings/apps", pathname) ? "bg-muted text-foreground" : "text-muted-foreground"}`}>
            {tr("Connected apps")}
            <ChevronRight className="size-4" />
          </Link>
        </div>
      )}
    </>
  );
}

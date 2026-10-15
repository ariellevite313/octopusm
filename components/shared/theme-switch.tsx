"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { LANGS, useT } from "@/lib/i18n";

function useIsDark() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return { mounted, isDark: mounted && resolvedTheme === "dark", setTheme };
}

/** Bouton clair / sombre pour la barre latérale (ordinateur). */
export function ThemeSwitchRail() {
  const { tr } = useT();
  const { mounted, isDark, setTheme } = useIsDark();
  const label = isDark ? tr("Switch to light mode") : tr("Switch to dark mode");
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex size-11 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
    >
      {mounted ? (isDark ? <Sun className="size-[20px]" strokeWidth={1.75} /> : <Moon className="size-[20px]" strokeWidth={1.75} />) : <span className="size-[20px]" />}
    </button>
  );
}

/** Langue + thème dans le menu du téléphone (même colonne que la navigation). */
export function MobileSettings() {
  const { tr, lang, setLang } = useT();
  const { mounted, isDark, setTheme } = useIsDark();
  return (
    <div className="space-y-3 border-t border-border p-3">
      <div>
        <p className="mb-2 px-1 text-[13px] font-semibold text-muted-foreground">{tr("Language")}</p>
        <div className="flex flex-wrap gap-1.5">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${lang === l.code ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}
            >
              {l.short}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 px-1 text-[13px] font-semibold text-muted-foreground">{tr("Theme")}</p>
        <div className="flex gap-1 rounded-full bg-muted p-1">
          {([["light", Sun, tr("Light")], ["dark", Moon, tr("Dark")]] as const).map(([id, Icon, label]) => {
            const active = mounted && (id === "dark") === isDark;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTheme(id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-semibold transition-colors ${active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                <Icon className="size-4" />{label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

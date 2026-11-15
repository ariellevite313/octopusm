"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { LANGS, useT } from "@/lib/i18n";
import { COLOR_MODES, useColorMode } from "@/lib/color-mode";

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

/** Mode couleur pour la barre latérale (ordinateur) : chaque appui passe au mode suivant (normal, DOGE, PEPE, CLT). */
export function DogeSwitchRail() {
  const { mode, set } = useColorMode();
  const order = ["none", ...COLOR_MODES.map((m) => m.id)] as const;
  const cur = COLOR_MODES.find((m) => m.id === mode);
  const next = order[(order.indexOf(mode) + 1) % order.length];
  const label = cur ? `${cur.label} mode` : "Color mode";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => set(next)}
      className={`flex size-11 items-center justify-center rounded-2xl transition-colors hover:bg-muted/60 ${cur ? "" : "opacity-70 hover:opacity-100"}`}
      style={cur ? { boxShadow: `0 0 0 2px ${cur.color}` } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cur?.logo ?? "/chains/dogecoin.png"} alt="" className={`size-[22px] rounded-full object-cover ${cur ? "" : "grayscale"}`} />
    </button>
  );
}

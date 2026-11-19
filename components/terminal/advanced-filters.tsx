"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import type { TerminalToken } from "@/lib/terminal";

/** Filtres avancés du Terminal (appliqués sur l'appareil, gardés d'une visite à l'autre). */
export type AdvFilters = { mcMin?: number; mcMax?: number; liqMin?: number; volMin?: number; ageMaxH?: number };
const KEY = "om_terminal_adv_v1";

export function useAdvFilters() {
  const [f, setF] = useState<AdvFilters>({});
  useEffect(() => { try { setF(JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {}); } catch { /* stockage indisponible */ } }, []);
  const save = (v: AdvFilters) => { setF(v); try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } };
  const count = Object.values(f).filter((v) => v != null).length;
  const pass = (t: TerminalToken) =>
    (f.mcMin == null || (t.mcap ?? 0) >= f.mcMin) && (f.mcMax == null || (t.mcap ?? Infinity) <= f.mcMax)
    && (f.liqMin == null || (t.liquidity ?? 0) >= f.liqMin) && (f.volMin == null || (t.volume24h ?? 0) >= f.volMin)
    && (f.ageMaxH == null || (!!t.createdAt && Date.now() - Date.parse(t.createdAt) <= f.ageMaxH * 3_600_000));
  return { f, save, count, pass };
}

const FIELDS: [keyof AdvFilters, string, string][] = [
  ["mcMin", "Market cap min", "$"], ["mcMax", "Market cap max", "$"], ["liqMin", "Liquidity min", "$"], ["volMin", "Volume 24h min", "$"], ["ageMaxH", "Max age", "h"],
];

export function AdvFiltersForm({ value, onApply }: { value: AdvFilters; onApply: (v: AdvFilters) => void }) {
  const { tr } = useT();
  const [d, setD] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map(([k]) => [k, value[k] != null ? String(value[k]) : ""])));
  const apply = () => {
    const v: AdvFilters = {};
    for (const [k] of FIELDS) { const n = Number(d[k].replace(/[\s,$]/g, "").replace(/k$/i, "e3").replace(/m$/i, "e6")); if (d[k].trim() && Number.isFinite(n) && n >= 0) v[k] = n; }
    onApply(v);
  };
  return (
    <div className="space-y-3">
      {FIELDS.map(([k, label, unit]) => (
        <label key={k} className="flex items-center justify-between gap-3">
          <span className="text-[14px] font-medium text-foreground">{tr(label)}</span>
          <span className="relative w-36">
            <input inputMode="decimal" value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} placeholder={unit === "h" ? "24" : "10k"}
              className="num h-10 w-full rounded-xl bg-muted pl-3 pr-8 text-right text-[14px] outline-none placeholder:text-muted-foreground/60" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">{unit}</span>
          </span>
        </label>
      ))}
      <p className="text-[12px] text-muted-foreground">{tr("You can type 10k or 2m.")}</p>
      <div className="flex gap-2 pt-1">
        <button onClick={() => onApply({})} className="h-12 flex-1 rounded-2xl bg-muted text-[15px] font-semibold text-foreground">{tr("Reset")}</button>
        <button onClick={apply} className="h-12 flex-1 rounded-2xl bg-foreground text-[15px] font-bold text-background">{tr("Apply")}</button>
      </div>
    </div>
  );
}

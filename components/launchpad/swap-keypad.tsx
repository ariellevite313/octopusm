"use client";

import { Delete } from "lucide-react";
import { useT } from "@/lib/i18n";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"] as const;

/** Pavé numérique du swap : édite une chaîne décimale (ex. "0.25"). */
export function SwapKeypad({ value, onChange, maxDecimals = 6 }: {
  value: string;
  onChange: (next: string) => void;
  maxDecimals?: number;
}) {
  const { tr } = useT();
  function press(k: (typeof KEYS)[number]) {
    const v = value || "";
    if (k === "del") { onChange(v.slice(0, -1)); return; }
    if (k === ".") { if (!v.includes(".")) onChange((v || "0") + "."); return; }
    const [, dec] = v.split(".");
    if (dec !== undefined && dec.length >= maxDecimals) return;
    onChange(v === "0" ? k : v + k);
  }
  return (
    <div className="grid grid-cols-3">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => press(k)}
          aria-label={k === "del" ? tr("Delete") : k}
          className="flex h-[52px] items-center justify-center rounded-2xl text-[22px] font-semibold text-foreground transition-colors active:bg-muted md:hover:bg-muted"
        >
          {k === "del" ? <Delete className="size-6" /> : k}
        </button>
      ))}
    </div>
  );
}

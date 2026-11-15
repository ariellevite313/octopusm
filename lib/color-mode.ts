"use client";
/**
 * Modes couleur optionnels d'OM : DOGE (jaune), PEPE (vert), CLT (bleu). Boutons en verre transparent 3D teinté.
 * Classe « mode-… » sur <html>, mémorisée dans le navigateur. COLOR_MODE_BOOT l'applique avant l'affichage.
 */
import { useEffect, useState } from "react";

export type ColorMode = "none" | "doge" | "pepe" | "clt";
export const COLOR_MODES: { id: Exclude<ColorMode, "none">; label: string; logo: string; color: string }[] = [
  { id: "doge", label: "DOGE", logo: "/chains/dogecoin.png", color: "#f7c531" },
  { id: "pepe", label: "PEPE", logo: "/pepe.png", color: "#5cb848" },
  { id: "clt", label: "CLT", logo: "/clawdtrust-coin.png", color: "#0052ff" },
];
const KEY = "om-color-mode";
const CLASSES = ["mode-doge", "mode-pepe", "mode-clt"];
export const COLOR_MODE_BOOT = `try{var m=localStorage.getItem("${KEY}");if(m==="doge"||m==="pepe"||m==="clt")document.documentElement.classList.add("mode-"+m)}catch(e){}`;

export function useColorMode() {
  const [mode, setMode] = useState<ColorMode>("none");
  useEffect(() => {
    const c = CLASSES.find((k) => document.documentElement.classList.contains(k));
    setMode(c ? (c.slice(5) as ColorMode) : "none");
  }, []);
  const set = (m: ColorMode) => {
    setMode(m);
    document.documentElement.classList.remove(...CLASSES);
    if (m !== "none") document.documentElement.classList.add(`mode-${m}`);
    try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  };
  return { mode, set };
}

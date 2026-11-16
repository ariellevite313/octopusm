"use client";
/**
 * Style du cadre des cartes token : "glass" (verre + liquide clair, par défaut), "color" (liquide aux couleurs du logo), "classic" (cadre plein).
 * Attribut data-card sur <html>, mémorisé dans le navigateur. CARD_STYLE_BOOT l'applique avant l'affichage.
 */
import { useEffect, useState } from "react";

export type CardStyle = "glass" | "color" | "classic";
const KEY = "om_card_style";

export const CARD_STYLE_BOOT = `try{var c=localStorage.getItem("${KEY}");if(c==="color"||c==="classic")document.documentElement.setAttribute("data-card",c)}catch(e){}`;

export function useCardStyle() {
  const [style, setStyle] = useState<CardStyle>("glass");
  useEffect(() => {
    const c = document.documentElement.getAttribute("data-card");
    setStyle(c === "color" || c === "classic" ? c : "glass");
  }, []);
  const change = (s: CardStyle) => {
    setStyle(s);
    if (s === "glass") document.documentElement.removeAttribute("data-card");
    else document.documentElement.setAttribute("data-card", s);
    try { localStorage.setItem(KEY, s); } catch { /* stockage indisponible */ }
  };
  return { style, change };
}

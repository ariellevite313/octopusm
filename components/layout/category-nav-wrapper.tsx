"use client";

import { usePathname } from "next/navigation";
import { CategoryNav } from "./category-nav";

const MARKET_PREFIXES = ["/", "/crypto", "/sports", "/politics", "/entertainment", "/market", "/updown"];
const CATEGORIES = ["crypto", "sports", "politics", "entertainment"];

export function CategoryNavWrapper() {
  const pathname = usePathname();

  // Affiche uniquement sur les pages market
  const isMarketPage =
    pathname === "/" ||
    CATEGORIES.some((c) => pathname === `/${c}` || pathname.startsWith(`/${c}/`)) ||
    pathname.startsWith("/market") ||
    pathname.startsWith("/updown");

  if (!isMarketPage) return null;

  // Détermine la catégorie active
  const active = CATEGORIES.find((c) => pathname === `/${c}` || pathname.startsWith(`/${c}/`)) ?? "all";

  return <CategoryNav categories={CATEGORIES} active={active} />;
}

"use client";

import { usePathname } from "next/navigation";
import { CategoryNav } from "./category-nav";

type Props = { categories: string[] };

export function CategoryNavWrapper({ categories }: Props) {
  const pathname = usePathname();

  // Affiche uniquement sur les pages market
  const isMarketPage =
    pathname === "/" ||
    categories.some((c) => pathname === `/${c}` || pathname.startsWith(`/${c}/`)) ||
    pathname.startsWith("/market") ||
    pathname.startsWith("/updown");

  if (!isMarketPage) return null;

  // Détermine la catégorie active
  const active = categories.find((c) => pathname === `/${c}` || pathname.startsWith(`/${c}/`)) ?? "all";

  return <CategoryNav categories={categories} active={active} />;
}

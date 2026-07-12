"use client";

import dynamic from "next/dynamic";

const BottomNav = dynamic(
  () => import("@/components/layout/bottom-nav").then((m) => m.BottomNav),
  { ssr: false }
);

export function BottomNavWrapper() {
  return <BottomNav />;
}

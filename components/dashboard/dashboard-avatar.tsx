"use client";

import Image from "next/image";
import { useT } from "@/lib/i18n";

export function DashboardAvatar({ src }: { src: string }) {
  const { tr } = useT();
  return (
    <Image
      src={src}
      alt={tr("avatar")}
      width={48}
      height={48}
      unoptimized
      className="size-16 rounded-full object-cover shrink-0"
    />
  );
}

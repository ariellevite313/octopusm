"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";

/** Page ouverte depuis un lien partagé : la carte en grand, puis les boutons pour venir sur OM. */
export function ShareCardView({ image, alt, primary, secondary }: {
  image: string; alt: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  const { tr } = useT();
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center px-4 py-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={alt} width={1080} height={1240} className="w-full rounded-[28px]" />
      <div className="mt-6 flex w-full flex-col gap-3">
        <Link href={primary.href} className="flex h-14 items-center justify-center rounded-full bg-foreground text-[16px] font-bold text-background">{tr(primary.label)}</Link>
        {secondary && <Link href={secondary.href} className="flex h-14 items-center justify-center rounded-full bg-muted text-[16px] font-semibold text-foreground">{tr(secondary.label)}</Link>}
      </div>
    </main>
  );
}

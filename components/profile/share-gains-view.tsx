"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";

export function ShareGainsView({ wallet, period, code, name }: { wallet: string; period: string; code: string | null; name: string | null }) {
  const { tr } = useT();
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center px-4 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/og/gains/${encodeURIComponent(wallet)}?p=${period}`}
        alt={name ? tr("{name} creator gains", { name }) : tr("Creator gains")}
        width={1200}
        height={630}
        className="w-full rounded-[24px] ring-1 ring-border"
      />
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row">
        <Link
          href={code ? `/?ref=${encodeURIComponent(code)}` : "/"}
          className="flex h-14 flex-1 items-center justify-center rounded-full bg-foreground text-[16px] font-bold text-background"
        >
          {code ? tr("Join with code {code}", { code }) : tr("Open OMdot.fun")}
        </Link>
        <Link
          href={`/profile/${encodeURIComponent(wallet)}`}
          className="flex h-14 flex-1 items-center justify-center rounded-full bg-muted text-[16px] font-semibold text-foreground"
        >
          {tr("View profile")}
        </Link>
      </div>
    </main>
  );
}

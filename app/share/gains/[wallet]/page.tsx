import type { Metadata } from "next";
import Link from "next/link";
import { getCreatorGains, fmtGain, GAINS_PERIODS, type GainsPeriod } from "@/lib/creator-gains";

type Props = { params: Promise<{ wallet: string }>; searchParams: Promise<{ p?: string; ref?: string }> };

const periodOf = (p?: string): GainsPeriod => (p && p in GAINS_PERIODS ? (p as GainsPeriod) : "30d");

// Page de partage : son aperçu (Open Graph / X) est la carte des gains du créateur.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { wallet } = await params;
  const { p } = await searchParams;
  const period = periodOf(p);
  const g = await getCreatorGains(decodeURIComponent(wallet)).catch(() => null);
  const title = g ? `${g.name} earned ${fmtGain(g.total)} ${g.currency} as a creator - OMdotfun` : "Creator gains - OMdotfun";
  const description = "Launch your token on OMdot.fun and earn 1% of every trade.";
  const image = `/api/og/gains/${encodeURIComponent(wallet)}?p=${period}`;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ShareGainsPage({ params, searchParams }: Props) {
  const { wallet } = await params;
  const { p, ref } = await searchParams;
  const period = periodOf(p);
  const w = decodeURIComponent(wallet);
  const g = await getCreatorGains(w).catch(() => null);
  const code = ref ?? g?.refCode ?? null;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center px-4 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/og/gains/${encodeURIComponent(w)}?p=${period}`}
        alt={g ? `${g.name} creator gains` : "Creator gains"}
        width={1200}
        height={630}
        className="w-full rounded-[24px] shadow-[0_20px_60px_-20px_rgba(255,122,26,0.55)] ring-1 ring-border"
      />
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row">
        <Link
          href={code ? `/?ref=${encodeURIComponent(code)}` : "/"}
          className="flex h-14 flex-1 items-center justify-center rounded-full bg-primary text-[16px] font-bold text-white"
        >
          {code ? `Join with code ${code}` : "Open OMdot.fun"}
        </Link>
        <Link
          href={`/profile/${encodeURIComponent(w)}`}
          className="flex h-14 flex-1 items-center justify-center rounded-full bg-muted text-[16px] font-semibold text-foreground"
        >
          View profile
        </Link>
      </div>
    </main>
  );
}

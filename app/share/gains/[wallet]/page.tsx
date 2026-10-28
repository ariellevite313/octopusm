import type { Metadata } from "next";
import { ShareGainsView } from "@/components/profile/share-gains-view";
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
  const description = "Launch your token on OMdot.fun and earn up to 0.9% of every trade.";
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

  return <ShareGainsView wallet={w} period={period} code={code} name={g ? g.name : null} />;
}

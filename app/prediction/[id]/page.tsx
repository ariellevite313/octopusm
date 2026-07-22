export const revalidate = 60;

import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getMarketBySlug,
  getMarketVolumeDetail,
  getMarketComments,
} from "@/services/prediction-service";
import { PredictionDetail } from "@/components/prediction/prediction-detail";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id }  = await params;
  const market  = await getMarketBySlug(id);
  if (!market) return { title: "Market not found — OMdotfun" };

  const slug    = market.slug ?? market.id;
  const ogImage = `/api/og/market/${slug}`;
  const description = market.resolution_criteria ?? market.resolution_label ?? "Prediction market on OMdotfun.";

  return {
    title: `${market.title} — OMdotfun`,
    description,
    alternates: { canonical: `https://omdot.fun/prediction/${slug}` },
    openGraph: {
      title:       market.title,
      description,
      url:         `https://omdot.fun/prediction/${slug}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: market.title }],
    },
    twitter: {
      card:        "summary_large_image",
      title:       market.title,
      description,
      images:      [ogImage],
    },
  };
}

export default async function PredictionPage({ params }: Props) {
  const { id }  = await params;
  const market  = await getMarketBySlug(id);

  if (!market || !market.is_active || market.is_resolved) {
    notFound();
  }

  // Fetch volume + comments in parallel
  const [volumeDetail, initialComments] = await Promise.all([
    getMarketVolumeDetail(market.id),
    getMarketComments(market.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        All markets
      </Link>

      <PredictionDetail
        market={market}
        volumeDetail={volumeDetail}
        initialComments={initialComments}
      />
    </div>
  );
}

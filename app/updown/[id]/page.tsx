import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { UpDownDetail } from "@/components/updown/updown-detail";

type Props = { params: Promise<{ id: string }> };

async function getUpDownMarket(id: string) {
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("updown_markets")
    .select("id, symbol, strike_price, opens_at, resolve_at, duration_min")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const market = await getUpDownMarket(id);

  if (!market) {
    return { title: "Up/Down Round | OMdotfun" };
  }

  const symbol = (market.symbol ?? "Crypto").replace("USDT", "");
  const title = `${symbol} Up/Down Round | OMdotfun`;
  const description = `Predict the ${symbol} price direction on OMdotfun. Strike: $${market.strike_price ?? "—"}.`;

  return {
    title,
    description,
    alternates: { canonical: `https://omdot.fun/updown/${id}` },
    openGraph: {
      title,
      description,
      url: `https://omdot.fun/updown/${id}`,
      type: "website",
      images: [{ url: "/branding-logo.jpeg", width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/branding-logo.jpeg"],
    },
  };
}

export default async function UpDownRoundPage({ params }: Props) {
  const { id } = await params;
  return <UpDownDetail marketId={id} />;
}

import type { Metadata } from "next";
import { ShareCardView } from "@/components/share/share-card-view";
import { getPublicProfile } from "@/services/profile-service";

type Props = { params: Promise<{ wallet: string }>; searchParams: Promise<{ ref?: string }> };

// Page de partage d'un profil : son aperçu (X, Telegram, WhatsApp…) est la carte des gains du profil.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const wallet = decodeURIComponent((await params).wallet);
  const d = await getPublicProfile(wallet).catch(() => null);
  const total = d ? d.earnings.won_usd + d.earnings.launchpad_usd + d.earnings.market_fees_usd : 0;
  const name = d?.wallet?.display_name || `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
  const title = `${name} earned $${total.toLocaleString("en-US", { maximumFractionDigits: 2 })} on OMdotfun`;
  const description = "Predict, launch and trade on OMdot.fun.";
  const image = `/api/og/profile/${encodeURIComponent(wallet)}?wide=1`;
  return {
    title: { absolute: title }, description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }], type: "profile" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ShareProfilePage({ params, searchParams }: Props) {
  const wallet = decodeURIComponent((await params).wallet);
  const { ref } = await searchParams;
  return (
    <ShareCardView
      image={`/api/og/profile/${encodeURIComponent(wallet)}`}
      alt="Profile gains"
      primary={{ href: ref ? `/?ref=${encodeURIComponent(ref)}` : "/", label: "Open OMdot.fun" }}
      secondary={{ href: `/profile/${encodeURIComponent(wallet)}`, label: "View profile" }}
    />
  );
}

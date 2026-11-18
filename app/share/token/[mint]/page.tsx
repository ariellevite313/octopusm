import type { Metadata } from "next";
import { ShareCardView } from "@/components/share/share-card-view";
import { getTokenCard } from "@/lib/trade-card";

type Props = { params: Promise<{ mint: string }>; searchParams: Promise<{ ref?: string }> };
const ok = (m: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m) || /^0x[0-9a-fA-F]{40}$/.test(m);

// Page de partage d'un token : son aperçu (X, Telegram, WhatsApp…) est la carte du token.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const mint = decodeURIComponent((await params).mint);
  const card = ok(mint) ? await getTokenCard(mint).catch(() => null) : null;
  const title = card ? `$${card.symbol} on OMdotfun` : "Token on OMdotfun";
  const description = "Trade any token on OMdot.fun.";
  const image = `/api/og/token/${encodeURIComponent(mint)}?wide=1`;
  return {
    title: { absolute: title }, description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ShareTokenPage({ params, searchParams }: Props) {
  const mint = decodeURIComponent((await params).mint);
  const { ref } = await searchParams;
  const m = ok(mint) ? mint : "";
  const terminal = `/terminal?${/^0x/.test(m) ? "chain=arc&" : ""}mint=${encodeURIComponent(m)}${ref ? `&ref=${encodeURIComponent(ref)}` : ""}`;
  return (
    <ShareCardView
      image={`/api/og/token/${encodeURIComponent(m)}`}
      alt="Token card"
      primary={{ href: terminal, label: "Trade this token" }}
    />
  );
}

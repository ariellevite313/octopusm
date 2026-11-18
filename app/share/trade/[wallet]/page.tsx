import type { Metadata } from "next";
import { ShareCardView } from "@/components/share/share-card-view";
import { getTradeCard } from "@/lib/trade-card";

type Props = { params: Promise<{ wallet: string }>; searchParams: Promise<{ mint?: string; ref?: string }> };
const ok = (m?: string) => !!m && (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m) || /^0x[0-9a-fA-F]{40}$/.test(m));
const usd = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n) >= 1e6 ? `${(Math.abs(n) / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `${(Math.abs(n) / 1e3).toFixed(1)}K` : Math.abs(n).toFixed(2)}`;

// Page de partage d'un trade : son aperçu (X, Telegram, WhatsApp…) est la carte du trade.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const wallet = decodeURIComponent((await params).wallet);
  const { mint } = await searchParams;
  const card = ok(mint) ? await getTradeCard(wallet, mint!).catch(() => null) : null;
  const title = card ? `${card.name} ${usd(card.pnl)} on $${card.symbol} - OMdotfun` : "Trade on OMdotfun";
  const description = "Trade any token on OMdot.fun.";
  const q = `mint=${encodeURIComponent(mint ?? "")}`;
  const image = `/api/og/trade/${encodeURIComponent(wallet)}?${q}&wide=1`;
  return {
    title: { absolute: title }, description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ShareTradePage({ params, searchParams }: Props) {
  const wallet = decodeURIComponent((await params).wallet);
  const { mint, ref } = await searchParams;
  const m = ok(mint) ? mint! : "";
  const terminal = `/terminal?${/^0x/.test(m) ? "chain=arc&" : ""}mint=${encodeURIComponent(m)}${ref ? `&ref=${encodeURIComponent(ref)}` : ""}`;
  return (
    <ShareCardView
      image={`/api/og/trade/${encodeURIComponent(wallet)}?mint=${encodeURIComponent(m)}`}
      alt="Trade card"
      primary={{ href: terminal, label: "Trade this token" }}
      secondary={{ href: `/profile/${encodeURIComponent(wallet)}`, label: "View profile" }}
    />
  );
}

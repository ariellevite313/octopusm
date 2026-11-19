/**
 * GET /api/og/token/[mint][?wide=1]
 * Carte de partage d'un token (même style que la carte de trade) : capitalisation sur 30 jours, achats (B) et ventes (S)
 * passés par OM, variation de la capitalisation. Pour partager un token du Terminal sans l'avoir tradé.
 * wide=1 : version 1200×630 pour l'aperçu des liens (X, Telegram, WhatsApp…).
 */
import { limited } from "@/lib/limit";
import { getTokenCard } from "@/lib/trade-card";
import { localImage, money, pnlCardResponse, remoteImage } from "@/lib/og/pnl-card";

export async function GET(req: Request, { params }: { params: Promise<{ mint: string }> }) {
  { const lim = await limited(req, "og-token", 30); if (lim) return lim; }
  const mint = decodeURIComponent((await params).mint).trim();
  const url = new URL(req.url);
  const card = await getTokenCard(mint, url.searchParams.get("chain"), url.searchParams.get("pool")).catch(() => null);
  const [logo, chainLogo] = await Promise.all([remoteImage(card?.logo ?? null, url.origin), localImage(`chains/${card?.chain ?? "solana"}.png`)]);
  return pnlCardResponse({
    name: card ? (card.name || card.symbol).slice(0, 22) : "Token",
    avatar: logo,
    badge: card?.mcap ? `MC ${money(card.mcap)}` : "Terminal",
    dateMs: Date.now(),
    chainLogos: [chainLogo],
    series: card?.series ?? [],
    candles: card?.candles,
    marks: card?.marks ?? [],
    box: { logo, title: card?.symbol ?? "TOKEN", verified: card?.verified, amount: card?.change ?? 0, pct: card?.pct ?? null },
  }, { wide: url.searchParams.get("wide") === "1", cache: "public, max-age=300, s-maxage=300" });
}

/**
 * GET /api/og/trade/[wallet]?mint=…[&wide=1]
 * Carte de partage d'un trade (1080×1240) : cadre en verre incolore, OMDOTFUN, courbe avec les achats (B) et ventes (S),
 * gain réalisé + latent et pourcentage. N'importe qui peut partager la carte de n'importe quel wallet (activité publique).
 * wide=1 : version 1200×630 pour l'aperçu des liens (X, Telegram, WhatsApp…).
 */
import { limited } from "@/lib/limit";
import { getTradeCard } from "@/lib/trade-card";
import { localImage, money, pnlCardResponse, remoteImage } from "@/lib/og/pnl-card";

export async function GET(req: Request, { params }: { params: Promise<{ wallet: string }> }) {
  { const lim = await limited(req, "og-trade", 30); if (lim) return lim; }
  const { wallet } = await params;
  const url = new URL(req.url);
  const mint = (url.searchParams.get("mint") ?? "").trim();
  const card = mint ? await getTradeCard(decodeURIComponent(wallet), mint).catch(() => null) : null;
  const [avatar, tokenLogo, chainLogo] = await Promise.all([
    remoteImage(card?.avatar ?? null, url.origin), remoteImage(card?.logo ?? null, url.origin), localImage(`chains/${card?.chain ?? "solana"}.png`),
  ]);
  return pnlCardResponse({
    name: card?.name ?? "Trader",
    avatar,
    badge: card?.open ? "Open" : "Closed",
    dateMs: card?.lastAt ?? Date.now(),
    chainLogos: [chainLogo],
    series: card?.series ?? [],
    candles: card?.candles,
    marks: (card?.trades ?? []).map((t) => ({ t: t.tsMs, side: t.side, usd: t.usd })),
    box: {
      logo: tokenLogo, title: card?.symbol ?? "TOKEN", verified: card?.verified, amount: card?.pnl ?? 0, pct: card ? card.pct : 0,
      // Comme les cartes des plateformes d'échange : montant investi, entrée moyenne (capitalisation), capitalisation actuelle
      details: card ? [
        { label: "Invested", value: money(card.bought) },
        ...(card.mcap && card.price ? (() => {
          const boughtTok = card.trades.filter((t) => t.side === "buy").reduce((s, t) => s + t.tokens, 0);
          const avg = boughtTok > 0 ? (card.bought / boughtTok) * (card.mcap / card.price) : null;
          return [...(avg ? [{ label: "Avg. entry", value: money(avg) }] : []), { label: "Current", value: money(card.mcap) }];
        })() : []),
      ] : undefined,
    },
  }, { wide: url.searchParams.get("wide") === "1" });
}

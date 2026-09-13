import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/launchpad/stock-price/[symbol]
 *
 * Proxy vers l'API publique xStocks.fi pour récupérer le prix d'un stock tokenisé.
 * Aucune auth requise côté xStocks pour les endpoints publics.
 *
 * Réponse : { symbol, priceUsd, updatedAt }
 * Cache : 60s (les prix bougent peu sur ce délai)
 */

const XSTOCKS_API = "https://api.xstocks.fi/api/v2/public/assets";

// Prix fallback statiques pour les mocks sur testnet
// (xStocks API peut ne pas avoir les mock tokens)
const MOCK_PRICES: Record<string, number> = {
  xNVDA: 131.50,
  xTSLA: 248.20,
  xMSTR: 385.00,
  xAAPL: 227.00,
  xSPY:  556.00,
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const sym = symbol.toUpperCase();

  try {
    // Essayer l'API xStocks d'abord
    const res = await fetch(`${XSTOCKS_API}/${sym}/price-data`, {
      next: { revalidate: 60 },
    });

    if (res.ok) {
      const data = await res.json();
      // xStocks retourne { price, currency, timestamp, ... }
      const priceUsd: number = data?.price ?? data?.priceUsd ?? data?.lastPrice ?? 0;

      if (priceUsd > 0) {
        return NextResponse.json(
          { symbol: sym, priceUsd, source: "xstocks", updatedAt: new Date().toISOString() },
          { headers: { "Cache-Control": "public, s-maxage=60" } }
        );
      }
    }

    // Fallback : prix statique pour les mocks testnet
    const fallbackPrice = MOCK_PRICES[sym];
    if (fallbackPrice) {
      return NextResponse.json(
        { symbol: sym, priceUsd: fallbackPrice, source: "mock", updatedAt: new Date().toISOString() },
        { headers: { "Cache-Control": "public, s-maxage=30" } }
      );
    }

    return NextResponse.json(
      { error: `Prix introuvable pour ${sym}` },
      { status: 404 }
    );
  } catch (err) {
    console.error(`[stock-price] erreur pour ${sym}:`, err);

    // Toujours servir le fallback même en cas d'erreur réseau
    const fallbackPrice = MOCK_PRICES[sym];
    if (fallbackPrice) {
      return NextResponse.json(
        { symbol: sym, priceUsd: fallbackPrice, source: "mock", updatedAt: new Date().toISOString() },
        { headers: { "Cache-Control": "public, s-maxage=30" } }
      );
    }

    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";

/**
 * GET /api/launchpad/quote-assets
 *
 * Retourne la liste statique des quote assets disponibles pour les stock-paired tokens.
 * En production, ces adresses correspondent aux contrats déployés dans Deploy.s.sol.
 * Les prix sont enrichis en live depuis /api/launchpad/stock-price/[symbol].
 *
 * On garde ça statique côté serveur pour éviter un appel onchain à chaque render.
 * Les adresses sont mises à jour après chaque déploiement.
 */

export interface QuoteAsset {
  address: string;
  symbol: string;
  name: string;
  logoUri: string;
  decimals: number;
}

// Mettre à jour ces adresses après le déploiement via Deploy.s.sol
const QUOTE_ASSETS: QuoteAsset[] = [
  {
    address: process.env.NEXT_PUBLIC_XNVDA_ADDRESS ?? "",
    symbol:  "xNVDA",
    name:    "Nvidia Stock Token",
    logoUri: "/stocks/nvda.svg",
    decimals: 6,
  },
  {
    address: process.env.NEXT_PUBLIC_XTSLA_ADDRESS ?? "",
    symbol:  "xTSLA",
    name:    "Tesla Stock Token",
    logoUri: "/stocks/tsla.svg",
    decimals: 6,
  },
  {
    address: process.env.NEXT_PUBLIC_XMSTR_ADDRESS ?? "",
    symbol:  "xMSTR",
    name:    "MicroStrategy Stock Token",
    logoUri: "/stocks/mstr.svg",
    decimals: 6,
  },
  {
    address: process.env.NEXT_PUBLIC_XAAPL_ADDRESS ?? "",
    symbol:  "xAAPL",
    name:    "Apple Stock Token",
    logoUri: "/stocks/aapl.svg",
    decimals: 6,
  },
  {
    address: process.env.NEXT_PUBLIC_XSPY_ADDRESS ?? "",
    symbol:  "xSPY",
    name:    "S&P 500 ETF Token",
    logoUri: "/stocks/spy.svg",
    decimals: 6,
  },
];

export async function GET() {
  // Filtrer les entrées sans adresse (non encore déployées)
  const assets = QUOTE_ASSETS.filter(a => a.address.length > 0);

  return NextResponse.json(
    { assets },
    { headers: { "Cache-Control": "public, s-maxage=3600" } }
  );
}

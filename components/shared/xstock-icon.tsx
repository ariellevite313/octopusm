/**
 * XStockIcon — affiche le logo d'un xStock (image ou emoji fallback).
 * Utilisé partout où un sigle xStock est montré (badges, swap, wizard…).
 */
import { XSTOCK_LOGOS, XSTOCK_CATALOG_SOLANA } from "@/lib/solana/xstocks";

interface XStockIconProps {
  symbol: string;   // ex: "xNVDA", "xMSTR"
  size?: number;    // px, défaut 16
  className?: string;
}

export function XStockIcon({ symbol, size = 16, className = "" }: XStockIconProps) {
  const logo = XSTOCK_LOGOS[symbol];

  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={symbol}
        width={size}
        height={size}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const entry = XSTOCK_CATALOG_SOLANA.find(s => s.symbol === symbol);
  const emoji = entry?.emoji ?? "📈";

  return (
    <span
      className={`shrink-0 leading-none ${className}`}
      style={{ fontSize: size * 0.85 }}
      aria-label={symbol}
    >
      {emoji}
    </span>
  );
}

/**
 * XStockBadge — badge compact "logo + $SYMBOL" pour les listes et cards.
 */
export function XStockBadge({ symbol, className = "" }: { symbol: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/25 px-2 py-0.5 text-[10px] font-bold text-amber-400 ${className}`}>
      <XStockIcon symbol={symbol} size={12} />
      ${symbol.replace(/^x/, "")}
    </span>
  );
}

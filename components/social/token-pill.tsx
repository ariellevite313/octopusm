import Link from "next/link";
import type { FeaturedToken } from "@/lib/social/featured-token";

/** Logo carré du token recommandé (coins arrondis, fin contour) ; clic = page du token sur OMdotfun. */
export function TokenPill({ token, size = 20 }: { token: FeaturedToken | null | undefined; size?: number }) {
  if (!token) return null;
  const radius = Math.max(4, Math.round(size / 4));
  return (
    <Link
      href={token.href}
      title={`$${token.ticker}`}
      aria-label={`$${token.ticker}`}
      className="inline-flex shrink-0 overflow-hidden ring-1 ring-border transition-transform hover:scale-105"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {token.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={token.logo} alt="" className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center bg-muted text-[10px] font-bold text-foreground">{token.ticker.slice(0, 2)}</span>
      )}
    </Link>
  );
}

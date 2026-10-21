import Link from "next/link";
import type { FeaturedToken } from "@/lib/social/featured-token";

/** Logo carré (bord arrondi, contour) du token recommandé ; clic = page du token sur OMdotfun. */
export function TokenPill({ token, size = 20 }: { token: FeaturedToken | null | undefined; size?: number }) {
  if (!token) return null;
  const pad = Math.max(3, Math.round(size / 6));
  return (
    <Link
      href={token.href}
      title={`$${token.ticker}`}
      aria-label={`$${token.ticker}`}
      className="inline-flex shrink-0 items-center justify-center rounded-[10px] border border-border bg-card transition-transform hover:scale-105"
      style={{ padding: pad }}
    >
      {token.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={token.logo} alt="" className="rounded-[6px] object-cover" style={{ width: size, height: size }} />
      ) : (
        <span className="flex items-center justify-center rounded-[6px] bg-muted text-[10px] font-bold text-foreground" style={{ width: size, height: size }}>
          {token.ticker.slice(0, 2)}
        </span>
      )}
    </Link>
  );
}

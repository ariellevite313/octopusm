import Image from "next/image";

/**
 * TokenLogo — uses real coin images from /public.
 * token: "usdc" | "clawdtrust"
 * className: Tailwind size class (default "size-4")
 */
export function TokenLogo({
  token,
  className = "size-4",
}: {
  token: string;
  className?: string;
}) {
  const src = token === "usdc" ? "/usdc-coin.png" : "/clawdtrust-coin.png";
  const alt = token === "usdc" ? "USDC" : "ClawdTrust";

  return (
    <Image
      src={src}
      alt={alt}
      width={24}
      height={24}
      className={`${className} rounded-full object-contain`}
    />
  );
}

/** Inline token amount with logo */
export function TokenAmount({
  amount,
  token,
  logoClass = "size-3.5",
  className = "",
}: {
  amount: string | number;
  token: string;
  logoClass?: string;
  className?: string;
}) {
  const label = token === "usdc" ? "USDC" : "ClawdTrust";
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <TokenLogo token={token} className={logoClass} />
      <span>{amount}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

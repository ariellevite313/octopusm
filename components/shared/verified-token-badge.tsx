/* eslint-disable @next/next/no-img-element */
/** Puce de vérification des tokens (launchpad uniquement). */
export function VerifiedTokenBadge({ className = "size-4" }: { className?: string }) {
  return (
    <img
      src="/verified-token.png"
      alt="Verified"
      title="Verified token"
      className={`inline-block shrink-0 select-none object-contain ${className}`}
      draggable={false}
    />
  );
}

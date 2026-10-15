/**
 * Logo Solana monochrome, sans bulle : prend la couleur du texte
 * (blanc sur fond sombre, noir sur fond clair). Passer une couleur via className
 * (ex. "text-white") pour forcer.
 */
export function SolanaMark({ className = "size-4", title = "Solana" }: { className?: string; title?: string }) {
  return (
    <span
      role="img"
      aria-label={title}
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{
        WebkitMaskImage: "url(/solana-mark.png)", maskImage: "url(/solana-mark.png)",
        WebkitMaskSize: "contain", maskSize: "contain",
        WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
        WebkitMaskPosition: "center", maskPosition: "center",
      }}
    />
  );
}

/**
 * Logos de chaîne monochromes (Solana, Arc), sans bulle : prend la couleur du texte
 * (blanc sur fond sombre, noir sur fond clair). Passer une couleur via className
 * (ex. "text-white") pour forcer.
 */
function MaskMark({ src, className, title }: { src: string; className: string; title: string }) {
  return (
    <span
      role="img"
      aria-label={title}
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{
        WebkitMaskImage: `url(${src})`, maskImage: `url(${src})`,
        WebkitMaskSize: "contain", maskSize: "contain",
        WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
        WebkitMaskPosition: "center", maskPosition: "center",
      }}
    />
  );
}

export function SolanaMark({ className = "size-4", title = "Solana" }: { className?: string; title?: string }) {
  return <MaskMark src="/solana-mark.png" className={className} title={title} />;
}

/** Logo Arc monochrome, même comportement que SolanaMark. */
export function ArcMark({ className = "size-4", title = "Arc" }: { className?: string; title?: string }) {
  return <MaskMark src="/arc-mark.png" className={className} title={title} />;
}

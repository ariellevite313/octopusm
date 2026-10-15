import type { LucideIcon } from "lucide-react";

/** Pictogramme d'état vide : icône lucide dans un rond discret. */
export function EmptyIcon({ icon: Icon, className = "" }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={`flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground ${className}`} aria-hidden="true">
      <Icon className="size-7" strokeWidth={1.75} />
    </span>
  );
}

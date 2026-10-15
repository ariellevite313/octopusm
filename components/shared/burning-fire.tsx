import { Flame } from "lucide-react";

// Flamme animée : elle danse comme une vraie flamme.
export function BurningFire({ className = "" }: { className?: string }) {
  return (
    <span className={`fire-emoji inline-block select-none leading-none ${className}`} aria-hidden="true">
      <Flame className="size-[1em] fill-orange-500 text-orange-500" />
    </span>
  );
}

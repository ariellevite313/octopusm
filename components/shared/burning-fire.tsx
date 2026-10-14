// Emoji 🔥 animé : il danse comme une vraie flamme.

export function BurningFire({ className = "" }: { className?: string }) {
  return (
    <span className={`fire-emoji inline-block select-none leading-none ${className}`} aria-hidden="true">
      🔥
    </span>
  );
}

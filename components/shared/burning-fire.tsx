// Petit feu animé (décoratif) : trois flammes qui dansent + braises qui montent.

const FLAME = "M12 1.5c.6 3.2-1.2 4.9-2.6 6.6C7.8 10 6.5 12 6.5 14.6 6.5 18.6 9 22 12 22s5.5-3.4 5.5-7.4c0-2.3-1-4.3-2.3-5.8.1 1.7-.5 3-1.6 3.6.3-3.9-.7-7.6-1.6-10.9Z";

export function BurningFire({ className = "size-6" }: { className?: string }) {
  return (
    <span className={`burning-fire relative inline-block ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <radialGradient id="bf-glow" cx="50%" cy="70%" r="50%">
            <stop offset="0%" stopColor="#ff7a1a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ff7a1a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="12" cy="17" rx="11" ry="8" fill="url(#bf-glow)" className="bf-glow" />
        <path d={FLAME} fill="#e8380d" className="bf-outer" />
        <path d={FLAME} fill="#ff8a1f" className="bf-mid" />
        <path d={FLAME} fill="#ffd23f" className="bf-inner" />
        <circle cx="9" cy="8" r="0.9" fill="#ffb347" className="bf-ember bf-e1" />
        <circle cx="14.5" cy="7" r="0.7" fill="#ffd23f" className="bf-ember bf-e2" />
        <circle cx="12" cy="5" r="0.6" fill="#ff8a1f" className="bf-ember bf-e3" />
      </svg>
    </span>
  );
}

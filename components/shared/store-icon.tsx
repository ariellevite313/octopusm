/** Logo de l'OM Store : triangle arrondi avec une fente, en couleur du texte. */
export function StoreIcon({ className = "size-5" }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="260 190 630 730" className={className} fill="currentColor" aria-hidden>
      <defs>
        <mask id="om-store-slit" maskUnits="userSpaceOnUse" x="0" y="0" width="1080" height="1080">
          <rect width="1080" height="1080" fill="#fff" />
          <path d="M415 405 L760 735" stroke="#000" strokeWidth="62" strokeLinecap="round" />
        </mask>
      </defs>
      <path d="M345 290 L800 545 L345 815 Z" stroke="currentColor" strokeWidth="150" strokeLinejoin="round" mask="url(#om-store-slit)" />
    </svg>
  );
}

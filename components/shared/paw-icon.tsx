/** Patte de chien pleine (couleur = currentColor), pour le bouton de création. */
export function PawIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <ellipse cx="4.3" cy="10.2" rx="2.5" ry="3.3" transform="rotate(-26 4.3 10.2)" />
      <ellipse cx="9.1" cy="4.6" rx="2.7" ry="3.6" transform="rotate(-10 9.1 4.6)" />
      <ellipse cx="14.9" cy="4.6" rx="2.7" ry="3.6" transform="rotate(10 14.9 4.6)" />
      <ellipse cx="19.7" cy="10.2" rx="2.5" ry="3.3" transform="rotate(26 19.7 10.2)" />
      <path d="M12 11.2c-3.5 0-7.4 3.7-8.2 7-.7 2.7 1.2 4.7 3.9 4.2 1.7-.3 2.8-1.1 4.3-1.1s2.6.8 4.3 1.1c2.7.5 4.6-1.5 3.9-4.2-.8-3.3-4.7-7-8.2-7z" />
    </svg>
  );
}

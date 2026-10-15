/* eslint-disable @next/next/no-img-element */
/** Photo de profil, ou initiale si absente. */
export function UserAvatar({ src, name, size = 20, className = "" }: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const initial = name.replace(/^@/, "").slice(0, 1).toUpperCase() || "?";
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.45)) };
  return src ? (
    <img src={src} alt="" loading="lazy" style={style} className={`shrink-0 rounded-full object-cover ${className}`} />
  ) : (
    <span style={style} className={`flex shrink-0 items-center justify-center rounded-full bg-muted font-bold text-muted-foreground ${className}`}>
      {initial}
    </span>
  );
}

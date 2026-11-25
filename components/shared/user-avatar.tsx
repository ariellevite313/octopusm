/* eslint-disable @next/next/no-img-element */
import { avatarOr } from "@/lib/default-avatar";
/** Photo de profil, ou Omero si absente. */
export function UserAvatar({ src, name, size = 20, className = "" }: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const initial = name.replace(/^@/, "").slice(0, 1).toUpperCase() || "?";
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.45)) };
  void initial;
  return <img src={avatarOr(src)} alt="" loading="lazy" style={style} className={`shrink-0 rounded-full object-cover ${className}`} />;
}

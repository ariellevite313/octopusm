import type { Metadata } from "next";
import { ShareCardView } from "@/components/share/share-card-view";
import { isTheme, isTopStyle } from "@/lib/og/top-card";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ref?: string; theme?: string; style?: string }> };
const ok = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

// Page de partage d'un classement « Top 10 » : son aperçu (X, Telegram…) est l'image du classement.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const id = (await params).id;
  const sp = await searchParams;
  const th = sp.theme ?? null, st = sp.style ?? null;
  const q = (isTheme(th) && th !== "dark" ? `&theme=${th}` : "") + (isTopStyle(st) && st !== "table" ? `&style=${st}` : "");
  const title = "Top 10 on OMdotfun";
  const description = "Daily top tokens on OMdot.fun.";
  const image = ok(id) ? `/api/og/top/${id}?wide=1${q}` : "/og-omdot.png";
  return {
    title: { absolute: title }, description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ShareTopPage({ params, searchParams }: Props) {
  const id = (await params).id;
  const { ref, theme, style } = await searchParams;
  const qs = [isTheme(theme ?? null) && theme !== "dark" ? `theme=${theme}` : "", isTopStyle(style ?? null) && style !== "table" ? `style=${style}` : ""].filter(Boolean).join("&");
  const q = qs ? `?${qs}` : "";
  return (
    <ShareCardView
      image={ok(id) ? `/api/og/top/${id}${q}` : "/og-omdot.png"}
      alt="Top 10"
      primary={{ href: `/terminal${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`, label: "Open the Terminal" }}
    />
  );
}

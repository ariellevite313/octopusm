import type { Metadata } from "next";
import { AppDetail } from "@/components/discover/app-detail";
import { createAdminClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Aperçu au partage (X, WhatsApp, Telegram…) : nom, accroche et l'image de la fiche, toujours à jour.
 *  L'adresse de l'image change avec les visites et les avis, pour que les réseaux ne gardent pas une vieille image. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  let name = "OM Store", tagline = "An app on OM Store.", v = "0";
  if (UUID.test(id)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createAdminClient() as any;
      const { data } = await db.from("discover_apps").select("name, tagline, rating_count, rating_avg").eq("id", id).eq("status", "live").maybeSingle();
      if (data) { name = data.name; tagline = data.tagline || tagline; }
      const { data: x } = await db.from("discover_apps").select("visits").eq("id", id).maybeSingle().then((r: unknown) => r, () => ({ data: null }));
      v = `${data?.rating_count ?? 0}-${Number(data?.rating_avg ?? 0).toFixed(1)}-${x?.visits ?? 0}`;
    } catch { /* aperçu par défaut */ }
  }
  const image = { url: `/api/og/discover/${id}?v=${v}`, width: 1200, height: 630, alt: name };
  return {
    title: name,
    description: tagline,
    openGraph: { title: `${name} · OM Store`, description: tagline, images: [image], type: "website" },
    twitter: { card: "summary_large_image", title: `${name} · OM Store`, description: tagline, images: [image.url] },
  };
}

export default async function AppPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-xl pb-32 sm:max-w-3xl md:max-w-4xl lg:max-w-5xl">
      <AppDetail id={id} />
    </div>
  );
}

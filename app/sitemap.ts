import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/server";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://octomarket.app";
  const admin = createAdminClient() as any;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl,                        lastModified: new Date(), changeFrequency: "hourly",  priority: 1.0 },
    { url: `${siteUrl}/pools`,             lastModified: new Date(), changeFrequency: "hourly",  priority: 0.9 },
    { url: `${siteUrl}/archive`,           lastModified: new Date(), changeFrequency: "daily",   priority: 0.6 },
    { url: `${siteUrl}/leaderboard`,       lastModified: new Date(), changeFrequency: "hourly",  priority: 0.7 },
    { url: `${siteUrl}/launch`,            lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  ];

  // Active prediction markets
  const { data: markets } = await admin
    .from("prediction_markets")
    .select("slug, id, updated_at")
    .eq("is_active", true)
    .eq("is_resolved", false)
    .limit(200);

  const marketRoutes: MetadataRoute.Sitemap = (markets ?? []).map((m: { slug: string | null; id: string; updated_at: string }) => ({
    url: `${siteUrl}/prediction/${m.slug ?? m.id}`,
    lastModified: new Date(m.updated_at),
    changeFrequency: "hourly" as const,
    priority: 0.8,
  }));

  // Active pools
  const { data: pools } = await admin
    .from("mutuel_markets")
    .select("slug, updated_at")
    .in("status", ["active", "closed"])
    .limit(200);

  const poolRoutes: MetadataRoute.Sitemap = (pools ?? []).map((p: { slug: string; updated_at: string }) => ({
    url: `${siteUrl}/pools/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "hourly" as const,
    priority: 0.8,
  }));

  return [...staticRoutes, ...marketRoutes, ...poolRoutes];
}

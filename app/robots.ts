import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://omdot.fun";
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/prediction/",
          "/pools/",
          "/archive",
          "/leaderboard",
          "/launchpad",
          "/faq",
        ],
        disallow: [
          "/dashboard",
          "/admin",
          "/api/",
          "/launchpad/create",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://omdot.fun";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/prediction/", "/pools/", "/archive", "/leaderboard", "/launch"],
        disallow: ["/dashboard", "/admin", "/api/"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}

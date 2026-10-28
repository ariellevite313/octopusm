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
          "/feed",
          "/post/",
          "/profile/",
        ],
        disallow: [
          "/dashboard",
          "/admin",
          "/api/",
          "/launchpad/create",
          "/notifications",
          "/settings",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}

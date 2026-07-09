import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uswgrdqkftjlhlilhgfp.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // Polyfill Buffer pour @solana/web3.js (webpack uniquement, pas Turbopack)
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      buffer: require.resolve("buffer"),
    };
    config.plugins.push(
      new (require("webpack").ProvidePlugin)({
        Buffer: ["buffer", "Buffer"],
      })
    );
    return config;
  },

  // Headers de securite
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://mainnet.helius-rpc.com https://*.solana.com https://solana-rpc.publicnode.com https://rpc.ankr.com https://solana.drpc.org https://1rpc.io https://api.dexscreener.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Type-check and lint run separately via `tsc --noEmit` / `next lint`.
  // Running them inside the build worker causes Zone OOM on memory-constrained machines.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Limit parallelism to avoid stack overrun (0xC0000409) on Windows build workers.
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uswgrdqkftjlhlilhgfp.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "db.omdot.fun",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // Polyfill Buffer pour @solana/web3.js (webpack uniquement, pas Turbopack)
  webpack: (config, { dev }) => {
    // Build de production : pas de cache webpack (il faisait monter le build à 3,6 Go et le serveur le tuait ; sans lui ~2,1 Go)
    if (!dev) config.cache = false;
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

  // Rewrite silencieux : / → /launchpad (URL reste /)
  async rewrites() {
    return [
      { source: "/", destination: "/launchpad" },
    ];
  },

  // Headers de securite
  async headers() {
    return [
      {
        // Digital Asset Links — requis pour TWA standalone (sans barre URL)
        source: "/.well-known/assetlinks.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
      {
        // Pages HTML : toujours revalidées (jamais servies périmées par un CDN/navigateur après un déploiement)
        source: "/((?!_next/|api/|.*\\..*).*)",
        headers: [{ key: "Cache-Control", value: "private, no-cache, must-revalidate" }],
      },
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
              "connect-src 'self' https://auth.privy.io https://*.privy.io wss://*.privy.io https://*.privy.systems https://*.rpc.privy.systems https://explorer-api.walletconnect.com https://*.supabase.co wss://*.supabase.co https://db.omdot.fun wss://db.omdot.fun https://api.binance.com wss://stream.binance.com:9443 https://mainnet.helius-rpc.com https://*.solana.com https://solana-rpc.publicnode.com https://rpc.ankr.com https://solana.drpc.org https://1rpc.io https://api.dexscreener.com https://api.geckoterminal.com https://api.mainnet-beta.solana.com https://quote-api.jup.ag https://*.jup.ag https://rpc.mainnet.arc.io https://*.walletconnect.org wss://*.walletconnect.org https://*.walletconnect.com wss://*.walletconnect.com https://*.reown.com wss://*.reown.com",
              "frame-src https://auth.privy.io https://*.privy.io https://dexscreener.com https://verify.walletconnect.org https://verify.walletconnect.com https://secure.walletconnect.org https://secure.walletconnect.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;

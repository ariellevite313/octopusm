import { T } from "@/lib/i18n-mark";

const CLT_DEXSCREENER = "https://dexscreener.com/solana/egi97rat7zrxrqvvv7edb5tvxzzxwgdh8vwvkgpfzdfc";

/** Liens secondaires (ex-menu « … »), affichés dans le menu ☰ du haut. */
export const MORE_ITEMS = [
  { label: "$CLAWDTRUST", description: T("Our partner token on Solana"), href: CLT_DEXSCREENER, external: true },
  { label: T("Support"), description: T("Get help from the team"), href: "https://t.me/Omdotfun", external: true },
  { label: T("FAQ"), description: T("Frequently asked questions"), href: "/faq", external: false },
  { label: T("Tutorial"), description: T("Learn how to use OMdotfun"), href: "https://t.me/OmdotfunTuto", external: true },
  { label: T("ŌM Policy"), description: T("Rules, prohibitions, removals"), href: "/policy", external: false },
  { label: T("Privacy Policy"), description: T("How we handle your data"), href: "/privacy", external: false },
];

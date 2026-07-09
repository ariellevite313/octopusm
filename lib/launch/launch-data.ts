// ---------------------------------------------------------------------------
// Launch page — shared constants & types
// ---------------------------------------------------------------------------

export type LaunchOption = "free" | "standard";
export type LaunchStatus = "idle" | "loading" | "success" | "error";
export type ChartRange = "1H" | "6H" | "24H" | "7D";

export type ChartPoint = {
  timestamp: number;
  label: string;
  close: number;
  high: number;
  low: number;
  volume: number;
};

export type OctopusTokenBoardItem = {
  id: string;
  name: string;
  ticker: string;
  logoSrc?: string;
  price: string;
  volume24h: string;
  marketCap: string;
  holders: string;
  status: string;
  launchedByWallet?: string;
  launchedByName?: string;
  contractAddress?: string;
  poolAddress?: string;
  solscanUrl?: string;
  dexScreenerUrl?: string;
  birdEyeUrl?: string;
  bagsFmUrl?: string;
  initialBuyPercent?: number;
  chartPoints?: ChartPoint[];
  lastUpdatedLabel?: string;
};

// Official ClawdTrust token
export const OFFICIAL_TOKEN_ADDRESS = "DjdyfQGdtiejPhaSgraS1qaiWVhgrEFTSnd9bVnYBAGS";
export const OFFICIAL_TOKEN_LOGO_SRC =
  "https://studio-assets.supernova.io/files/ws/757243/922fd25daca69e8f633021e9bfd2d46e24302685b31272da4458bae196cb2ee6.jpeg";
export const OFFICIAL_TOKEN_GOLD_BADGE_SRC =
  "https://studio-assets.supernova.io/files/ws/757243/2f25ed55d146075e38472bdc708603004b4959dee3f03f4e93ea9bfca247f038.png";
export const OFFICIAL_DEX_PAIR = "EGi97Rat7zrxRQVVV7EDb5TvxzZXwGDh8vwVKgpfZdFC";

// Payment
export const SOLANA_PAYMENT_ADDRESS = "EsR6usyjCzhgL6dZFqHRsw6pDh7CgvfHtkQzCybJMuCZ";
export const BASE_LAUNCH_FEE_SOL = 5;
export const DISCOUNT_LAUNCH_FEE_SOL = 4.5;
export const FREE_LAUNCH_FEE_SOL = 0.2;
export const PREMIUM_HOLDER_THRESHOLD_USD = 100;

export const TOKENS_STORAGE_KEY = "octopus-market-token-board-v3";

export const TOKENS_SEED: OctopusTokenBoardItem[] = [
  {
    id: "clawdtrust",
    name: "ClawdTrust",
    ticker: "ClawdTrust",
    logoSrc: OFFICIAL_TOKEN_LOGO_SRC,
    price: "—",
    volume24h: "—",
    marketCap: "—",
    holders: "28",
    status: "Tracked",
    contractAddress: OFFICIAL_TOKEN_ADDRESS,
    poolAddress: OFFICIAL_DEX_PAIR,
    solscanUrl: `https://solscan.io/token/${OFFICIAL_TOKEN_ADDRESS}`,
    dexScreenerUrl: `https://dexscreener.com/solana/${OFFICIAL_DEX_PAIR.toLowerCase()}`,
    birdEyeUrl: `https://birdeye.so/solana/token/${OFFICIAL_TOKEN_ADDRESS}`,
    bagsFmUrl: `https://bags.fm/${OFFICIAL_TOKEN_ADDRESS}`,
    initialBuyPercent: 0,
  },
];

export const LAUNCH_OPTIONS: Array<{
  id: LaunchOption;
  title: string;
  description: string;
  badge: string;
}> = [
  {
    id: "free",
    title: "Free option",
    description:
      "Launch from Octo Market with a lightweight 0.2 SOL processing fee and direct Bags.fm submission.",
    badge: "0.2 SOL standard fee",
  },
  {
    id: "standard",
    title: "Premium launch",
    description:
      "Get a premium launch flow with a 10% reduction when the connected wallet holds at least $100 in $ClawdTrust, plus 2 KOL, 1 month of support, regular posts, strategic advice, branding, and 2 AMA before Bags.fm publication.",
    badge: "$100 in $ClawdTrust · 10% off",
  },
];

export const LAUNCH_BENEFITS = [
  "Free option available with a 0.2 SOL standard fee",
  "Premium launch gets a 10% reduction if the wallet holds at least $100 in $ClawdTrust",
  "Premium launch includes 2 KOL activations and 1 month of support",
  "Regular posts, strategic advice, and branding are included in the premium launch",
  "2 AMA sessions are included in the premium launch package",
  "Deployer first buy can be configured between 1% and 5% of supply right at launch",
  "Bags.fm launch request is sent only after payment validation succeeds",
];

export const CHART_RANGE_OPTIONS: ChartRange[] = ["1H", "6H", "24H", "7D"];

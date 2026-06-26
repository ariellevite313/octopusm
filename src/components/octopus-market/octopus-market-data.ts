import type { LucideIcon } from "lucide-react";
import {
  AudioWaveform,
  Bot,
  ChartLine,
  Code,
  Coins,
  Database,
  Globe,
  Image,
  Rocket,
  Search,
  Shield,
  Sparkles,
  Star,
  Users,
  Video,
  Wallet,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
};

export type HighlightItem = {
  icon: LucideIcon;
  label: string;
  href?: string;
};

export type CategoryItem = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export type ToolTab = {
  value: string;
  label: string;
};

export type ToolVerificationTone = "blue" | "gold";

export type ToolItem = {
  name: string;
  price: string;
  category: string;
  description: string;
  badge: string;
  rating: string;
  users: string;
  url?: string;
  imageSrc?: string;
  logoSrc?: string;
  verificationLabel: string;
  verificationTone: ToolVerificationTone;
};

export type StepItem = {
  step: string;
  title: string;
  description: string;
};

export type PlanItem = {
  name: string;
  price: string;
  billing: string;
  description: string;
  savings?: string;
  featured?: boolean;
  cta: string;
  perks: string[];
};

export type BonusItem = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export type StatItem = {
  value: string;
  label: string;
};

export type PredictionMarketCategory = {
  id: string;
  label: string;
  description: string;
};

export type PredictionMarketOption = {
  id: string;
  label: string;
  oddsMultiplier: number;
  description?: string;
  logoSrc?: string;
  initialVolumeUsd?: number;
};

export type PredictionMarketVisualType = "vs" | "simple";

export type PredictionMarketVisualMeta = {
  visualType: PredictionMarketVisualType;
  singleName?: string;
  singleImageSrc?: string;
  leftCompetitorName?: string;
  leftCompetitorImageSrc?: string;
  rightCompetitorName?: string;
  rightCompetitorImageSrc?: string;
};

export type PredictionMarketQuestion = {
  id: string;
  categoryId: string;
  title: string;
  marketType: "yes-no" | "threshold" | "three-way";
  resolutionLabel: string;
  eventDateLabel?: string;
  /** ISO timestamp UTC — null = pas de date définie */
  eventStartAt?: string | null;
  options?: PredictionMarketOption[];
  /** true si le marché a été résolu — exclut le marché de la vue publique */
  isResolved?: boolean;
  /** ID de l'option gagnante après résolution */
  resolutionOutcomeId?: string;
  /** Timestamp (ms) de la résolution */
  resolvedAt?: number;
} & PredictionMarketVisualMeta;

export type AidoAgentFaqItem = {
  question: string;
  answer: string;
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
  geckoTerminalUrl?: string;
  bagsFmUrl?: string;
  initialBuyPercent?: number;
  chartPoints?: Array<{
    timestamp: number;
    label: string;
    close: number;
    high: number;
    low: number;
    volume: number;
  }>;
  lastUpdatedLabel?: string;
};

export const officialTokenName = "ClawdTrust";
export const officialTokenAddress = "DjdyfQGdtiejPhaSgraS1qaiWVhgrEFTSnd9bVnYBAGS";
export const officialTokenLogoSrc =
  "https://studio-assets.supernova.io/files/ws/757243/922fd25daca69e8f633021e9bfd2d46e24302685b31272da4458bae196cb2ee6.jpeg";
export const websiteUrl = "https://octopusmarket.fun";
export const mexicoRoundFlagLogoSrc =
  "https://studio-assets.supernova.io/files/ws/757243/9167b3c7185479c478773533173c0cdbdfe5f022855a076a44885c812a103341.png";
export const southAfricaRoundFlagLogoSrc =
  "https://studio-assets.supernova.io/files/ws/757243/dd40c0089f6efc0f8e2d09ff5e91c2941f0bb56fdf729945632c091767548f02.png";

export const navigationItems: NavItem[] = [
  { label: "Home", href: "#hero" },
  { label: "Prediction Market", href: "#prediction-market" },
  { label: "Launch Token", href: "#launch-token" },
  { label: "Explore AI", href: "#explore" },
];

export const highlightItems: HighlightItem[] = [];

export const heroStats: StatItem[] = [];

export const predictionMarketFeaturePoints = [
  "Prediction sections stay ready for future markets, and new markets appear as soon as the admin publishes them.",
  "Users connect a Solana wallet before using utility flows and approve USDC on Solana in Phantom.",
  "Each position supports a minimum of $2 and a maximum of $50 in USDC, with a 1% reserve fee preview.",
  "No default market stays visible anymore, so every live market shown on the platform now comes directly from admin publication.",
  "History, treasury routing, admin approval, estimated outcomes, and the 5% claim fee stay visible directly inside the studio.",
];

export const aidoAgentAccessAreas = [
  "Octopus Market home",
  "Launch token flow",
  "Prediction market sections",
  "Prediction history",
  "Explore catalog",
  "ClawdTrust feature",
  "AI listing",
  "Octopus Tokens board",
  "Pricing and contact",
  "Wallet-required utility gate",
  "Official token information",
  "Official website and X account",
];

export const aidoAgentFaqs: AidoAgentFaqItem[] = [
  {
    question: "What is Octopus Market (OM)?",
    answer:
      "Octopus Market (OM) is a global platform for project tokenization, a leading AI reference in Web3, and an innovative prediction market built on Solana.",
  },
  {
    question: "Which blockchain does Octopus Market use?",
    answer:
      "Octopus Market is fully built on Solana, which supports fast, low-cost, and highly scalable transactions.",
  },
  {
    question: "What is the main mission of Octopus Market?",
    answer:
      "The mission of Octopus Market is to support project creators with tokenization tools, AI expertise, and prediction market utilities so they can turn strong ideas into real outcomes.",
  },
  {
    question: "What does project tokenization mean on Octopus Market?",
    answer:
      "Project tokenization means turning a startup, business, initiative, intellectual property, or community project into blockchain-based digital assets on Solana to improve funding, governance, and liquidity.",
  },
  {
    question: "Why is Octopus Market considered an AI reference in Web3?",
    answer:
      "Octopus Market integrates advanced AI to analyze projects, improve tokenization decisions, guide creators, detect risk, and support better visibility and execution across Web3 flows.",
  },
  {
    question: "What does the prediction market on Octopus Market offer?",
    answer:
      "The prediction market lets users take positions on live events with Solana wallet approval, visible fee logic, admin review, and claim access for approved winners.",
  },
  {
    question: "What kind of support does Octopus Market provide to project creators?",
    answer:
      "Octopus Market provides personalized guidance across tokenization strategy, AI support, Web3 marketing, creator onboarding, launch preparation, and post-launch follow-through.",
  },
  {
    question: "Who can use Octopus Market?",
    answer:
      "Entrepreneurs, startups, content creators, communities, institutions, and innovators can use Octopus Market to tokenize projects, list AI products, or join prediction market flows.",
  },
  {
    question: "What is the official token of the platform?",
    answer: `The official token of the platform is ${officialTokenName}. Its contract address is ${officialTokenAddress}.`,
  },
  {
    question: "What is the official website of Octopus Market?",
    answer: `The official website is ${websiteUrl}.`,
  },
];

export const predictionMarketCategories: PredictionMarketCategory[] = [
  {
    id: "crypto",
    label: "Crypto",
    description: "Reserved for upcoming crypto markets.",
  },
  {
    id: "politics",
    label: "Politics",
    description: "Reserved for upcoming politics markets.",
  },
  {
    id: "sports",
    label: "Sports",
    description: "Live sports markets appear here only after the admin publishes them.",
  },
  {
    id: "cinema",
    label: "Cinema",
    description: "Reserved for upcoming cinema markets.",
  },
  {
    id: "technology",
    label: "Technology",
    description: "Reserved for upcoming technology markets.",
  },
  {
    id: "gaming",
    label: "Gaming",
    description: "Reserved for upcoming gaming markets.",
  },
];

export const predictionMarketQuestions: PredictionMarketQuestion[] = [];

export const promiseCards: BonusItem[] = [
  {
    icon: Globe,
    title: "Global project tokenization",
    description: "Turn a project into a visible Web3 asset with guided launch preparation and smarter execution support.",
  },
  {
    icon: Search,
    title: "AI discovery and listing",
    description: "Help users discover trusted AI products faster while giving teams a clear path to publish and grow.",
  },
  {
    icon: Shield,
    title: "Prediction market + monitoring",
    description:
      "Trade major events and run launch flows with visible wallet validation, team guidance, and intelligent monitoring.",
  },
];

export const categories: CategoryItem[] = [
  {
    icon: Bot,
    title: "Chatbots & Agents",
    description: "Assistants, copilots, customer support, autonomous workflows, and on-chain agents.",
  },
  {
    icon: Image,
    title: "Image generation",
    description: "Visual creation, product rendering, branding, and concept art.",
  },
  {
    icon: Video,
    title: "Video & Animation",
    description: "Editing, avatars, motion design, and ad content.",
  },
  {
    icon: ChartLine,
    title: "Trading & Finance",
    description: "Signals, analysis, portfolio tracking, and trading automation.",
  },
  {
    icon: Sparkles,
    title: "Writing & Marketing",
    description: "SEO, email, ad scripts, and campaign generation.",
  },
  {
    icon: Code,
    title: "Code & Development",
    description: "Pair programming, review, code generation, and debugging.",
  },
  {
    icon: Database,
    title: "Data & Analytics",
    description: "Dashboards, summaries, exploration, and smart reporting.",
  },
  {
    icon: AudioWaveform,
    title: "Voice & Audio",
    description: "Speech synthesis, voice cloning, podcasts, and assisted mixing.",
  },
];

export const toolTabs: ToolTab[] = [
  { value: "all", label: "All" },
  { value: "agents", label: "Agents" },
  { value: "image", label: "Images" },
  { value: "finance", label: "Finance" },
  { value: "code", label: "Code" },
];

export const featuredTools: ToolItem[] = [
  {
    name: "ClawdTrust",
    price: "Free/month",
    category: "agents",
    description: "Prediction market agent and rug control for Solana, currently available for free.",
    badge: "Solana agent",
    rating: "4.9/5",
    users: "492 users",
    url: "https://clawdtrust.com",
    imageSrc:
      "https://studio-assets.supernova.io/files/ws/757243/067fd6681a8d123b6eeb9991c1922285b1b2eed6e55f0de25fda0a9d0e92f233.jpeg",
    logoSrc:
      "https://studio-assets.supernova.io/files/ws/757243/922fd25daca69e8f633021e9bfd2d46e24302685b31272da4458bae196cb2ee6.jpeg",
    verificationLabel: "Gold verified",
    verificationTone: "gold",
  },
  {
    name: "Claude 3.5 Sonnet",
    price: "$29/month",
    category: "agents",
    description: "Premium reasoning model for support, strategy, and advanced writing.",
    badge: "Top reasoning",
    rating: "4.9/5",
    users: "32k users",
    url: "https://claude.ai",
    logoSrc:
      "https://studio-assets.supernova.io/files/ws/757243/3bc2547fed21883ed52a5488d06faafd83d27417455977757e6925d821cd9706.jpeg",
    verificationLabel: "Verified",
    verificationTone: "blue",
  },
  {
    name: "Midjourney V7",
    price: "$10/month",
    category: "image",
    description: "Ultra-realistic image generation for creators, agencies, and brands.",
    badge: "Top image",
    rating: "4.8/5",
    users: "48k users",
    verificationLabel: "Verified",
    verificationTone: "blue",
  },
  {
    name: "TradeGPT Pro",
    price: "$49/month",
    category: "finance",
    description: "Market signals, macro insights, and AI-assisted crypto and stock scenarios.",
    badge: "Top trading",
    rating: "4.7/5",
    users: "12k users",
    verificationLabel: "Verified",
    verificationTone: "blue",
  },
  {
    name: "Cursor Teams",
    price: "$20/month",
    category: "code",
    description: "Accelerated development environment with generation, editing, and refactoring.",
    badge: "Top code",
    rating: "4.9/5",
    users: "27k users",
    verificationLabel: "Verified",
    verificationTone: "blue",
  },
  {
    name: "Runway Studio",
    price: "$15/month",
    category: "image",
    description: "Generative video, smart editing, and creative assets for campaigns.",
    badge: "Creator pick",
    rating: "4.6/5",
    users: "19k users",
    verificationLabel: "Verified",
    verificationTone: "blue",
  },
  {
    name: "AutoAgent CRM",
    price: "$39/month",
    category: "agents",
    description: "AI agent for lead qualification, responses, and automated sales follow-up.",
    badge: "Growth pick",
    rating: "4.8/5",
    users: "9k users",
    verificationLabel: "Verified",
    verificationTone: "blue",
  },
];

export const steps: StepItem[] = [
  {
    step: "1",
    title: "Connect and register your wallet",
    description: "A Solana wallet connection and a saved profile are required before using payment-based platform actions.",
  },
  {
    step: "2",
    title: "Choose your flow",
    description: "Open Prediction Market, Launch Token, Explore AI, or List My AI depending on whether you want to trade, tokenize, discover, or publish.",
  },
  {
    step: "3",
    title: "Verify payments on-chain",
    description: "Octopus Market creates a Solana payment request, adds the 1% reserve fee on bets, checks the signature, recipient, and amount on-chain, then only records valid activity.",
  },
  {
    step: "4",
    title: "Track your activity from the dashboard",
    description: "Use My Bets, My Winnings, My Listed AI, and Wallet Dashboard from the navigation after wallet connection.",
  },
];

export const pricingPlans: PlanItem[] = [
  {
    name: "Builder",
    price: "100$",
    billing: "/year",
    description: "A one-year listing plan with 22% reduction and stronger long-term visibility for your AI product.",
    savings: "22% off",
    featured: true,
    cta: "Choose Builder",
    perks: [
      "Priority listing",
      "Featured badge included",
      "7-day spotlight placement",
      "Simplified performance dashboard",
    ],
  },
  {
    name: "Starter",
    price: "10$",
    billing: "/month",
    description: "A monthly entry plan to list your AI faster and start gathering visibility on Octopus Market.",
    cta: "Choose Starter",
    perks: [
      "Fast publication",
      "Marketplace visibility",
      "Product page editing",
      "Listing support access",
    ],
  },
];

export const bonusItems: BonusItem[] = [
  {
    icon: Rocket,
    title: "7-day spotlight",
    description: "Stronger visibility in the Trending section from the moment you go live.",
  },
  {
    icon: ChartLine,
    title: "Real-time analytics",
    description: "Track views, interest, and conversions directly from your page.",
  },
  {
    icon: Users,
    title: "VIP community access",
    description: "Join a privileged circle for exchanges, feedback, and opportunities.",
  },
  {
    icon: Star,
    title: "Featured badge",
    description: "Boost credibility with an instant visual trust marker on the platform.",
  },
];

export const octopusTokensSeed: OctopusTokenBoardItem[] = [
  {
    id: "clawdtrust",
    name: officialTokenName,
    ticker: "ClawdTrust",
    logoSrc: officialTokenLogoSrc,
    price: "Loading live price",
    volume24h: "Loading live volume",
    marketCap: "Loading live market cap",
    holders: "28",
    status: "Tracked",
    contractAddress: officialTokenAddress,
    poolAddress: "EGi97Rat7zrxRQVVV7EDb5TvxzZXwGDh8vwVKgpfZdFC",
    solscanUrl: `https://solscan.io/token/${officialTokenAddress}`,
    dexScreenerUrl: "https://dexscreener.com/solana/egi97rat7zrxrqvvv7edb5tvxzzxwgdh8vwvkgpfzdfc",
    birdEyeUrl: `https://birdeye.so/solana/token/${officialTokenAddress}`,
    bagsFmUrl: `https://bags.fm/${officialTokenAddress}`,
    initialBuyPercent: 0,
  },
];

export const contactItems: HighlightItem[] = [
  { icon: Globe, label: "Website · octopusmarket.fun", href: "#hero" },
  { icon: Globe, label: "X / Twitter · @octopusmarketai", href: "https://x.com/octopusmarketai" },
  { icon: Wallet, label: `Official token · $${officialTokenName} on BagsApp` },
  { icon: Shield, label: `CA · ${officialTokenAddress}` },
];

export const solanaPaymentAddress = "EsR6usyjCzhgL6dZFqHRsw6pDh7CgvfHtkQzCybJMuCZ";
export const solanaUsdcMintAddress = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const paymentTokenSymbol = "USDC";
export const clawdTrustDiscountAddress = officialTokenAddress;
export const clawdTrustThresholdUsd = 100;
export const predictionMarketTreasuryAddress = "EsR6usyjCzhgL6dZFqHRsw6pDh7CgvfHtkQzCybJMuCZ";
export const predictionMarketFeeRate = 5;
export const platformReserveFeeRate = 1;
export const predictionMarketReserveFeeRate = platformReserveFeeRate;
export const predictionMarketMinStakeUsd = 2;
export const predictionMarketMaxStakeUsd = 50;

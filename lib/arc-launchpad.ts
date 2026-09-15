// ─── Adresses sur Arc Testnet ─────────────────────────────────────────────────

/** OLD contract (tokens créés avant la migration AMM) */
export const ARC_LAUNCHPAD_ADDRESS = "0xC41000636c9952ebBBa5b3e08F8aE885748862b1" as const;

/** NEW — LaunchpadFactory déployé le 2026-09-09 (constant-product AMM) */
export const ARC_FACTORY_ADDRESS   = "0x003d8e0608877a3Bd73a41CE52Ba89F394675f86" as const;

export const ARC_USDC_ADDRESS      = "0x3600000000000000000000000000000000000000" as const;

// ─── Platform revenue ─────────────────────────────────────────────────────────
/** Treasury wallet that receives the 10 USDC creation fee on Arc */
export const ARC_TREASURY_ADDRESS  = (process.env.NEXT_PUBLIC_ARC_TREASURY_ADDRESS ?? "") as `0x${string}`;
/** Creation fee in USDC (human-readable). Charged once per token deployed on Arc. */
export const ARC_CREATION_FEE_USDC = 0; // Free for now — set to e.g. 10 to re-enable

// Supply standard : 1 milliard de tokens (18 décimales)
export const ARC_DEFAULT_SUPPLY    = BigInt("1000000000000000000000000000"); // 1e27

// basePrice : 1 (= 0.000001 USDC par token) — utilisé par l'ANCIEN contrat
export const ARC_DEFAULT_BASE_PRICE = BigInt(1);

// ─── ANCIEN contrat (ARC_LAUNCHPAD_ADDRESS) ───────────────────────────────────
// Utilisé pour les tokens créés AVANT la migration AMM.

export const LAUNCHPAD_ABI = [
  {
    type: "function",
    name: "create",
    inputs: [
      { name: "name",      type: "string",  internalType: "string"  },
      { name: "symbol",    type: "string",  internalType: "string"  },
      { name: "supply",    type: "uint256", internalType: "uint256" },
      { name: "basePrice", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "buy",
    inputs: [
      { name: "id",          type: "uint256", internalType: "uint256" },
      { name: "tokenAmount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getBuyCost",
    inputs: [
      { name: "id",          type: "uint256", internalType: "uint256" },
      { name: "tokenAmount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "launches",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "token",     type: "address", internalType: "address" },
      { name: "creator",   type: "address", internalType: "address" },
      { name: "supply",    type: "uint256", internalType: "uint256" },
      { name: "sold",      type: "uint256", internalType: "uint256" },
      { name: "raised",    type: "uint256", internalType: "uint256" },
      { name: "basePrice", type: "uint256", internalType: "uint256" },
      { name: "graduated", type: "bool",    internalType: "bool"    },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "launchCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Created",
    inputs: [
      { name: "id",        type: "uint256", indexed: true,  internalType: "uint256" },
      { name: "token",     type: "address", indexed: true,  internalType: "address" },
      { name: "creator",   type: "address", indexed: true,  internalType: "address" },
      { name: "name",      type: "string",  indexed: false, internalType: "string"  },
      { name: "symbol",    type: "string",  indexed: false, internalType: "string"  },
      { name: "supply",    type: "uint256", indexed: false, internalType: "uint256" },
      { name: "basePrice", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
] as const;

// ─── NOUVEAU — LaunchpadFactory (ARC_FACTORY_ADDRESS) ────────────────────────
// ABI minimal pour créer un token via la factory AMM.

// Adresses des mock xStock tokens (remplir après Deploy.s.sol)
export const ARC_XSTOCK_ADDRESSES: Record<string, `0x${string}`> = {
  xNVDA: (process.env.NEXT_PUBLIC_XNVDA_ADDRESS ?? "") as `0x${string}`,
  xTSLA: (process.env.NEXT_PUBLIC_XTSLA_ADDRESS ?? "") as `0x${string}`,
  xMSTR: (process.env.NEXT_PUBLIC_XMSTR_ADDRESS ?? "") as `0x${string}`,
  xAAPL: (process.env.NEXT_PUBLIC_XAAPL_ADDRESS ?? "") as `0x${string}`,
  xSPY:  (process.env.NEXT_PUBLIC_XSPY_ADDRESS  ?? "") as `0x${string}`,
};

export const FACTORY_ABI = [
  {
    type: "function",
    name: "createToken",
    inputs: [
      { name: "name",           type: "string",  internalType: "string"  },
      { name: "symbol",         type: "string",  internalType: "string"  },
      { name: "imageUri",       type: "string",  internalType: "string"  },
      { name: "description",    type: "string",  internalType: "string"  },
      { name: "firstBuyUsdc",   type: "uint256", internalType: "uint256" },
      { name: "holderRewards_", type: "bool",    internalType: "bool"    },
    ],
    outputs: [
      { name: "curve",       type: "address", internalType: "address" },
      { name: "token",       type: "address", internalType: "address" },
      { name: "vault_",      type: "address", internalType: "address" },
      { name: "distributor_",type: "address", internalType: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "TokenCreated",
    inputs: [
      { name: "curve",          type: "address", indexed: true,  internalType: "address" },
      { name: "token",          type: "address", indexed: true,  internalType: "address" },
      { name: "creator",        type: "address", indexed: true,  internalType: "address" },
      { name: "vault",          type: "address", indexed: false, internalType: "address" },
      { name: "feeDistributor", type: "address", indexed: false, internalType: "address" },
      { name: "holderRewards",  type: "bool",    indexed: false, internalType: "bool"    },
      { name: "name",           type: "string",  indexed: false, internalType: "string"  },
      { name: "symbol",         type: "string",  indexed: false, internalType: "string"  },
      { name: "imageUri",       type: "string",  indexed: false, internalType: "string"  },
      { name: "description",    type: "string",  indexed: false, internalType: "string"  },
      { name: "firstBuyUsdc",   type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  // ─── createStockPairedToken ───────────────────────────────────────────────
  {
    type: "function",
    name: "createStockPairedToken",
    inputs: [
      { name: "name",           type: "string",  internalType: "string"  },
      { name: "symbol",         type: "string",  internalType: "string"  },
      { name: "imageUri",       type: "string",  internalType: "string"  },
      { name: "description",    type: "string",  internalType: "string"  },
      { name: "quoteAsset_",    type: "address", internalType: "address" },
      { name: "firstBuyQuote",  type: "uint256", internalType: "uint256" },
    ],
    outputs: [
      { name: "curve", type: "address", internalType: "address" },
      { name: "token", type: "address", internalType: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "StockPairedTokenCreated",
    inputs: [
      { name: "curve",          type: "address", indexed: true,  internalType: "address" },
      { name: "token",          type: "address", indexed: true,  internalType: "address" },
      { name: "creator",        type: "address", indexed: true,  internalType: "address" },
      { name: "quoteAsset",     type: "address", indexed: false, internalType: "address" },
      { name: "name",           type: "string",  indexed: false, internalType: "string"  },
      { name: "symbol",         type: "string",  indexed: false, internalType: "string"  },
      { name: "imageUri",       type: "string",  indexed: false, internalType: "string"  },
      { name: "description",    type: "string",  indexed: false, internalType: "string"  },
      { name: "firstBuyQuote",  type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  // ─── isStockPaired ────────────────────────────────────────────────────────
  {
    type: "function",
    name: "isStockPaired",
    inputs: [{ name: "curve", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "curveQuoteAsset",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
] as const;

// ─── GenericBondingCurve ABI (stock-paired curves) ────────────────────────────

export const GENERIC_BONDING_CURVE_ABI = [
  {
    type: "function",
    name: "graduated",
    inputs: [],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "reserveQuote",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "reserveTokens",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "realQuoteRaised",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quoteAsset",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "spotPrice",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "graduationProgressBps",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "GRAD_THRESHOLD",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quoteToTokens",
    inputs: [{ name: "quoteIn", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "tokensOut", type: "uint256", internalType: "uint256" },
      { name: "fee",       type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "tokensToQuote",
    inputs: [{ name: "tokensIn", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "quoteOut", type: "uint256", internalType: "uint256" },
      { name: "fee",      type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "buy",
    inputs: [
      { name: "quoteIn",    type: "uint256", internalType: "uint256" },
      { name: "minTokens",  type: "uint256", internalType: "uint256" },
      { name: "recipient",  type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "sell",
    inputs: [
      { name: "tokensIn",   type: "uint256", internalType: "uint256" },
      { name: "minQuote",   type: "uint256", internalType: "uint256" },
      { name: "recipient",  type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "creatorFeesAccrued",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claimFees",
    inputs: [{ name: "to", type: "address", internalType: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Trade",
    inputs: [
      { name: "trader",         type: "address", indexed: true,  internalType: "address" },
      { name: "isBuy",          type: "bool",    indexed: false, internalType: "bool"    },
      { name: "quoteAmount",    type: "uint256", indexed: false, internalType: "uint256" },
      { name: "tokenAmount",    type: "uint256", indexed: false, internalType: "uint256" },
      { name: "fee",            type: "uint256", indexed: false, internalType: "uint256" },
      { name: "realQuoteRaised",type: "uint256", indexed: false, internalType: "uint256" },
      { name: "reserveQuote",   type: "uint256", indexed: false, internalType: "uint256" },
      { name: "reserveTokens",  type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
] as const;

// ─── NOUVEAU — BondingCurve clone (adresse = arc_launch_id en DB) ─────────────
// Chaque token AMM a son propre clone BondingCurve à cette adresse.

export const BONDING_CURVE_ABI = [
  // ── State ──────────────────────────────────────────────────────────────────
  {
    type: "function",
    name: "graduated",
    inputs: [],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "reserveUsdc",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "reserveTokens",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "realUsdcRaised",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "spotPrice",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "graduationProgressBps",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "GRAD_THRESHOLD",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  // ── Quotes ────────────────────────────────────────────────────────────────
  {
    type: "function",
    name: "quoteUsdcToTokens",
    inputs: [{ name: "usdcIn", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "tokensOut", type: "uint256", internalType: "uint256" },
      { name: "feeUsdc",   type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quoteTokensToUsdc",
    inputs: [{ name: "tokensIn", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "usdcOut", type: "uint256", internalType: "uint256" },
      { name: "feeUsdc", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  // ── Actions ───────────────────────────────────────────────────────────────
  {
    type: "function",
    name: "buy",
    inputs: [
      { name: "usdcIn",       type: "uint256", internalType: "uint256" },
      { name: "minTokensOut", type: "uint256", internalType: "uint256" },
      { name: "recipient",    type: "address", internalType: "address" },
    ],
    outputs: [
      { name: "tokensOut", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "sell",
    inputs: [
      { name: "tokensIn",  type: "uint256", internalType: "uint256" },
      { name: "minUsdcOut", type: "uint256", internalType: "uint256" },
      { name: "recipient",  type: "address", internalType: "address" },
    ],
    outputs: [
      { name: "usdcOut", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  // ── Events ────────────────────────────────────────────────────────────────
  {
    type: "event",
    name: "Trade",
    inputs: [
      { name: "trader",    type: "address", indexed: true,  internalType: "address" },
      { name: "isBuy",     type: "bool",    indexed: false, internalType: "bool"    },
      { name: "usdcAmt",   type: "uint256", indexed: false, internalType: "uint256" },
      { name: "tokenAmt",  type: "uint256", indexed: false, internalType: "uint256" },
      { name: "fee",       type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  // ── Fees créateur ─────────────────────────────────────────────────────────
  {
    type: "function",
    name: "creatorFeesAccrued",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claimFees",
    inputs: [{ name: "to", type: "address", internalType: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "FeesClaimed",
    inputs: [
      { name: "to",     type: "address", indexed: true,  internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Graduated",
    inputs: [
      { name: "pair",       type: "address", indexed: true,  internalType: "address" },
      { name: "usdcAdded",  type: "uint256", indexed: false, internalType: "uint256" },
      { name: "tokensAdded",type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
] as const;

// ─── Shared ──────────────────────────────────────────────────────────────────

export const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to",     type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address", internalType: "address" },
      { name: "amount",  type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner",   type: "address", internalType: "address" },
      { name: "spender", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
] as const;

/**
 * arc-launchpad.ts — V2 (coupure propre)
 *
 * Architecture :
 *   • Pré-graduation  : BondingCurveArcV2 standalone (native ETH = USDC Arc, 18 dec)
 *   • Post-graduation : Pool Uniswap V4 standard (fee=2500, spacing=25, hook=0x0)
 *   • Pas de hook custom, pas de FeeTier, pas de BondingCurveHook
 */

// ─── Adresses Arc Mainnet (Chain ID 5042) ─────────────────────────────────────

// Sur Arc, USDC est le token natif (ETH). address(0) en termes V4.
export const ARC_USDC_ADDRESS      = "0x0000000000000000000000000000000000000000" as const;
export const ARC_USDC_DECIMALS     = 18;

export const ARC_POOL_MANAGER_ADDRESS    = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as const;
export const ARC_POSITION_MANAGER_ADDRESS = "0x6049c9a0e26405C0985f9E3685C87d0aE917f82B" as const;

// ─── Adresses V2 (Arc mainnet — déployé le 2026-09-21) ───────────────────────
export const ARC_FACTORY_V2_ADDRESS  = "0xe2ddD55F4F26190d598d2D560A4c5dc1Aa39Ac31" as `0x${string}`;
export const ARC_CURVE_V2_IMPL       = "0x27C40C8A7a92BA4557BD0E2b61c99b6273B93080" as `0x${string}`;
export const ARC_VAULT_V4_IMPL       = "0x2aa8d4B7afff36735Cc904E2B032B586b724837A" as `0x${string}`;
export const ARC_TREASURY_ADDRESS    = (process.env.NEXT_PUBLIC_ARC_TREASURY_ADDRESS ?? "0xf1173b875829293F7f02C20f177242a556f302fA") as `0x${string}`;

// ─── Constantes bonding curve V2 (doivent correspondre à BondingCurveArcV2.sol) ─

export const BC_VIRTUAL_USDC   = 1_920n * 10n ** 18n;         // 1 920 USDC → FDV ouverture ≈ 2 400 USDC
export const BC_CURVE_SUPPLY   = 800_000_000n * 10n ** 18n;   // 800 M tokens alloués à la courbe
export const BC_GRAD_THRESHOLD = 2_000n * 10n ** 18n;         // 2 000 USDC levés → graduation
export const BC_FEE_BPS        = 200n;                        // 2 % (créateur 1 % + plateforme 1 %)
export const BC_K              = BC_VIRTUAL_USDC * BC_CURVE_SUPPLY;

export const ARC_DEFAULT_SUPPLY = BigInt("1000000000000000000000000000"); // 1e27

// ─── Quotes client-side (reproduit BondingCurveArcV2) ─────────────────────────

/**
 * Simule un buy. usdcGross = msg.value en wei.
 */
export function quoteArcBuy(
  reserveUsdc:   bigint,
  reserveTokens: bigint,
  usdcGross:     bigint,
  feeBps:        bigint = BC_FEE_BPS,
  K:             bigint = BC_K,
): { tokensOut: bigint; fee: bigint } {
  const fee      = usdcGross * feeBps / 10_000n;
  const usdcNet  = usdcGross - fee;
  const newResU  = reserveUsdc + usdcNet;
  const tokensOut = reserveTokens - (K + newResU - 1n) / newResU; // ceil → moins de tokens = safe
  return { tokensOut: tokensOut > 0n ? tokensOut : 0n, fee };
}

/**
 * Simule un sell. tokensIn en wei.
 */
export function quoteArcSell(
  reserveUsdc:   bigint,
  reserveTokens: bigint,
  tokensIn:      bigint,
  feeBps:        bigint = BC_FEE_BPS,
  K:             bigint = BC_K,
): { usdcOut: bigint; fee: bigint } {
  const newResT   = reserveTokens + tokensIn;
  const usdcGross = reserveUsdc - K / newResT;
  const fee       = usdcGross * feeBps / 10_000n;
  return { usdcOut: usdcGross - fee, fee };
}

// ─── Detection V2 ─────────────────────────────────────────────────────────────

/**
 * Retourne true si le token Arc est un token V2 (launchId = adresse de la curve standalone).
 * En V2, arc_launch_id est l'adresse du clone BondingCurveArcV2, ≠ token address.
 */
export function isArcV2Token(launchId: string, tokenAddress: string): boolean {
  return (
    launchId.startsWith("0x") &&
    launchId.toLowerCase() !== tokenAddress.toLowerCase()
  );
}

// ─── ABI : BondingCurveArcV2 ──────────────────────────────────────────────────

export const BONDING_CURVE_V2_ABI = [
  // ── State ─────────────────────────────────────────────────────────────────
  { type: "function", name: "graduated",     inputs: [], outputs: [{ name: "", type: "bool"    }], stateMutability: "view" },
  { type: "function", name: "reserveUsdc",   inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "reserveTokens", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "realUsdcRaised",inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "creatorAccrued",inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "creator",       inputs: [], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
  { type: "function", name: "token",         inputs: [], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
  { type: "function", name: "graduationVault",inputs:[],outputs: [{ name: "", type: "address" }], stateMutability: "view" },
  // ── Quotes ────────────────────────────────────────────────────────────────
  {
    type: "function", name: "quoteBuy", stateMutability: "view",
    inputs:  [{ name: "usdcIn",   type: "uint256" }],
    outputs: [{ name: "tokensOut", type: "uint256" }, { name: "fee", type: "uint256" }],
  },
  {
    type: "function", name: "quoteSell", stateMutability: "view",
    inputs:  [{ name: "tokensIn",  type: "uint256" }],
    outputs: [{ name: "usdcOut",   type: "uint256" }, { name: "fee", type: "uint256" }],
  },
  { type: "function", name: "currentPriceUsdc", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "progressBps",      inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  // ── Actions ───────────────────────────────────────────────────────────────
  {
    type: "function", name: "buy", stateMutability: "payable",
    inputs:  [{ name: "minTokensOut", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function", name: "sell", stateMutability: "nonpayable",
    inputs:  [{ name: "tokensIn", type: "uint256" }, { name: "minUsdcOut", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function", name: "claimCreatorFees", stateMutability: "nonpayable",
    inputs:  [{ name: "to", type: "address" }],
    outputs: [],
  },
  // ── Events ────────────────────────────────────────────────────────────────
  {
    type: "event", name: "Trade",
    inputs: [
      { name: "trader",       type: "address", indexed: true  },
      { name: "isBuy",        type: "bool",    indexed: false },
      { name: "usdcAmount",   type: "uint256", indexed: false },
      { name: "tokenAmount",  type: "uint256", indexed: false },
      { name: "fee",          type: "uint256", indexed: false },
      { name: "realUsdcRaised",type:"uint256", indexed: false },
      { name: "reserveUsdc",  type: "uint256", indexed: false },
      { name: "reserveTokens",type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "Graduated",
    inputs: [
      { name: "usdcSentToVault",   type: "uint256", indexed: false },
      { name: "tokensSentToVault", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "FeesClaimed",
    inputs: [
      { name: "to",     type: "address", indexed: true  },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

// ─── ABI : GraduationVaultV4 ──────────────────────────────────────────────────

export const GRADUATION_VAULT_V4_ABI = [
  { type: "function", name: "poolCreated",  inputs: [], outputs: [{ name: "", type: "bool"    }], stateMutability: "view" },
  { type: "function", name: "positionId",   inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "token",        inputs: [], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
  { type: "function", name: "creator",      inputs: [], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
  {
    type: "function", name: "collectFees", stateMutability: "nonpayable",
    inputs: [], outputs: [],
  },
  {
    type: "event", name: "PoolCreated",
    inputs: [
      { name: "poolId",    type: "bytes32", indexed: true  },
      { name: "tokenId",   type: "uint256", indexed: false },
      { name: "usdcUsed",  type: "uint256", indexed: false },
      { name: "tokensUsed",type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "FeesCollected",
    inputs: [
      { name: "usdcCollected", type: "uint256", indexed: false },
      { name: "tokensBurned",  type: "uint256", indexed: false },
    ],
  },
] as const;

// ─── ABI : LaunchpadFactoryArcV2 ──────────────────────────────────────────────

export const LAUNCHPAD_FACTORY_V2_ABI = [
  {
    type: "function", name: "createToken", stateMutability: "payable",
    inputs: [
      { name: "name",         type: "string"  },
      { name: "symbol",       type: "string"  },
      { name: "imageUri",     type: "string"  },
      { name: "description",  type: "string"  },
      { name: "firstBuyUsdc", type: "uint256" },
    ],
    outputs: [
      { name: "curve",  type: "address" },
      { name: "token",  type: "address" },
      { name: "vault",  type: "address" },
    ],
  },
  {
    type: "function", name: "allCurvesLength", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function", name: "isCurve", stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function", name: "curveRecord", stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "token",     type: "address" },
      { name: "curve",     type: "address" },
      { name: "vault",     type: "address" },
      { name: "creator",   type: "address" },
      { name: "graduated", type: "bool"    },
    ],
  },
  {
    type: "event", name: "TokenLaunched",
    inputs: [
      { name: "curve",       type: "address", indexed: true  },
      { name: "token",       type: "address", indexed: true  },
      { name: "creator",     type: "address", indexed: true  },
      { name: "vault",       type: "address", indexed: false },
      { name: "name",        type: "string",  indexed: false },
      { name: "symbol",      type: "string",  indexed: false },
      { name: "imageUri",    type: "string",  indexed: false },
      { name: "description", type: "string",  indexed: false },
      { name: "firstBuyUsdc",type: "uint256", indexed: false },
    ],
  },
  {
    type: "function", name: "CREATION_FEE", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ─── Topic Trade event (pour arc-trades API) ──────────────────────────────────

// keccak256("Trade(address,bool,uint256,uint256,uint256,uint256,uint256,uint256)")
export const TRADE_EVENT_TOPIC =
  "0x0c668488dc690d00c35c03638df49a1c8a7b63511eba0f88eeed1bd471719b16" as const;

// keccak256("Graduated(uint256,uint256)")
export const GRADUATED_EVENT_TOPIC =
  "0xacfdce92da76539f5af2efc3aa76d42a7a92af4d723a23d144f58fdf1472921e" as const;

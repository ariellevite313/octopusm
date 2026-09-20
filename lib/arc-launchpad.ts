import { encodeAbiParameters, keccak256 } from "viem";

// ─── Adresses sur Arc Mainnet (Chain ID 5042) ─────────────────────────────────

// Sur Arc, USDC est le token natif de la chaîne (address(0) en Uniswap V4).
// EVM : 18 decimals (eth_getBalance). Affiché en 6 decimals pour l'UX.
export const ARC_USDC_ADDRESS      = "0x0000000000000000000000000000000000000000" as const;
export const ARC_USDC_DECIMALS     = 18; // EVM native decimals

// ─── Uniswap V4 sur Arc Mainnet ───────────────────────────────────────────────

export const ARC_POOL_MANAGER_ADDRESS = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as const;

/**
 * Adresses V4 — à remplir après `forge script DeployV4.s.sol --broadcast`
 * Le déploiement V4 produit : BondingCurveHook, LaunchpadFactoryV4, BondingCurveRouter
 */
export const ARC_HOOK_ADDRESS        = "0xa8eba033F2ed31B79CF5c8c82b72Db6E2D818088" as `0x${string}`;
export const ARC_HOOK_ADDRESS_LEGACY = "0x88b136529931aa0db9ae626abe63921932fcc088" as `0x${string}`; // déploiement précédent — VIRTUAL_USDC=3200
export const ARC_ROUTER_ADDRESS      = "0x6cF7Ec4114aB8924B4f988100d5B5b830948443f" as `0x${string}`;
export const ARC_FACTORY_V4_ADDRESS  = "0x51894e8B17B53c8C98a4098F78f4d228e7b7907F" as `0x${string}`;

// ─── V4 PoolKey / PoolId helpers ─────────────────────────────────────────────

export const V4_POOL_FEE         = 0;    // 0% pool fee — hook takes 2% via beforeSwap
export const V4_TICK_SPACING     = 60;

/**
 * Constantes de la bonding curve (doivent correspondre à BondingCurveHook.sol)
 * K = VIRTUAL_USDC × CURVE_SUPPLY (bigint)
 */
export const BC_VIRTUAL_USDC        = 1_920n * 10n ** 18n;          // 1 920 USDC — mcap initial = 2 400 USDC (nouveau déploiement)
export const BC_VIRTUAL_USDC_LEGACY = 3_200n * 10n ** 18n;          // 3 200 USDC — mcap initial = 4 000 USDC (ancien déploiement)
export const BC_CURVE_SUPPLY        = 800_000_000n * 10n ** 18n;    // 800 M tokens (18 dec)
export const BC_GRAD_THRESHOLD      = 4_800n * 10n ** 18n;          // 4 800 USDC (18 dec natif Arc)
export const BC_FEE_BPS             = 200n;
export const BC_K                   = BC_VIRTUAL_USDC * BC_CURVE_SUPPLY;
export const BC_K_LEGACY            = BC_VIRTUAL_USDC_LEGACY * BC_CURVE_SUPPLY;

/**
 * Calcule le PoolKey d'un token V4 (currency0 < currency1 en adresse).
 * @param hookAddress  Adresse du hook — par défaut le hook courant.
 *                     Passer ARC_HOOK_ADDRESS_LEGACY pour les vieux tokens.
 */
export function getArcV4PoolKey(
  memeToken: `0x${string}`,
  hookAddress: `0x${string}` = ARC_HOOK_ADDRESS,
) {
  const usdc = ARC_USDC_ADDRESS.toLowerCase();
  const meme = memeToken.toLowerCase();
  const [c0, c1] = meme < usdc
    ? [meme as `0x${string}`, usdc as `0x${string}`]
    : [usdc as `0x${string}`, meme as `0x${string}`];
  return { currency0: c0, currency1: c1, fee: V4_POOL_FEE, tickSpacing: V4_TICK_SPACING, hooks: hookAddress };
}

/**
 * Calcule le PoolId (keccak256 de l'ABI-encoding du PoolKey).
 * Correspond à `key.toId()` en Solidity.
 */
export function getArcV4PoolId(
  memeToken: `0x${string}`,
  hookAddress: `0x${string}` = ARC_HOOK_ADDRESS,
): `0x${string}` {
  const key = getArcV4PoolKey(memeToken, hookAddress);
  return keccak256(encodeAbiParameters(
    [
      { type: "address" }, // currency0
      { type: "address" }, // currency1
      { type: "uint24"  }, // fee
      { type: "int24"   }, // tickSpacing
      { type: "address" }, // hooks
    ],
    [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]
  ));
}

/**
 * Détecte si un token Arc est un token V4 (launchId = tokenAddress)
 * vs standalone (launchId = BondingCurve clone address ≠ tokenAddress)
 */
export function isArcV4Token(launchId: string, tokenAddress: string): boolean {
  return (
    launchId.startsWith("0x") &&
    launchId.toLowerCase() === tokenAddress.toLowerCase()
  );
}

/**
 * Quote client-side pour un buy V4 (reproduit _quoteBuy du hook)
 * @param K  Constante de la courbe — BC_K (nouveau) ou BC_K_LEGACY (ancien déploiement)
 */
export function quoteBuyV4(
  reserveUsdc: bigint,
  reserveTokens: bigint,
  usdcGross: bigint,
  K: bigint = BC_K,
) {
  const fee      = usdcGross * BC_FEE_BPS / 10000n;
  const usdcNet  = usdcGross - fee;
  const newResU  = reserveUsdc + usdcNet;
  // ceil division pour newReserveTokens
  const newResT  = (K + newResU - 1n) / newResU;
  const tokensOut = reserveTokens > newResT ? reserveTokens - newResT : 0n;
  return { tokensOut, fee };
}

/**
 * Quote client-side pour un sell V4 (reproduit _quoteSell du hook)
 * @param K  Constante de la courbe — BC_K (nouveau) ou BC_K_LEGACY (ancien déploiement)
 */
export function quoteSellV4(
  reserveUsdc: bigint,
  reserveTokens: bigint,
  tokensIn: bigint,
  K: bigint = BC_K,
) {
  const newResT  = reserveTokens + tokensIn;
  const newResU  = K / newResT; // floor
  const usdcGross = reserveUsdc > newResU ? reserveUsdc - newResU : 0n;
  const fee      = usdcGross * BC_FEE_BPS / 10000n;
  const usdcOut  = usdcGross - fee;
  return { usdcOut, fee };
}

// ─── Platform revenue ─────────────────────────────────────────────────────────
/** Treasury wallet that receives fees on Arc */
export const ARC_TREASURY_ADDRESS  = (process.env.NEXT_PUBLIC_ARC_TREASURY_ADDRESS ?? "") as `0x${string}`;

// Supply standard : 1 milliard de tokens (18 décimales)
export const ARC_DEFAULT_SUPPLY    = BigInt("1000000000000000000000000000"); // 1e27

// ─── xStock addresses (Arc Mainnet) ──────────────────────────────────────────
export const ARC_XSTOCK_ADDRESSES: Record<string, `0x${string}`> = {
  xNVDA: "0x5221798179a89ff55dd8d119a929e4af15eb0158",
  xTSLA: "0x855b52f99d3cd9a9e7ada322a454919d44dc4805",
  xMSTR: "0xbd98109f05114a94cd9ee52d2f11c9fbc412c73c",
  xAAPL: "0x8f0e096f5d8fe61c60400d6d1d371901ec2d3199",
  xSPY:  "0xfa6dd9eeb6d117bd95ab0765dae5563de0550803",
};

// ─── BondingCurve clone ABI (V1 — gardé pour les anciens tokens) ──────────────
// claim-fees-arc.tsx et arc-creator-fees.tsx l'utilisent pour les tokens V1.

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

// ─── ABIs Uniswap V4 ─────────────────────────────────────────────────────────

/** ABI pour LaunchpadFactoryV4 */
export const FACTORY_V4_ABI = [
  {
    type: "function",
    name: "createToken",
    // Sur Arc, USDC est le token natif → msg.value = CREATION_FEE (10 USDC, 18 dec).
    // Plus de firstBuyUsdc — le premier achat se fait séparément via le router.
    inputs: [
      { name: "name",           type: "string",  internalType: "string"  },
      { name: "symbol",         type: "string",  internalType: "string"  },
      { name: "imageUri",       type: "string",  internalType: "string"  },
      { name: "feeDistributor", type: "address", internalType: "address" },
      { name: "creatorKeepBps", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "tokenAddr", type: "address", internalType: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "TokenCreated",
    inputs: [
      { name: "token",   type: "address", indexed: true,  internalType: "address" },
      { name: "creator", type: "address", indexed: true,  internalType: "address" },
      { name: "name",    type: "string",  indexed: false, internalType: "string"  },
      { name: "symbol",  type: "string",  indexed: false, internalType: "string"  },
      {
        name: "poolKey",
        type: "tuple",
        indexed: false,
        internalType: "struct PoolKey",
        components: [
          { name: "currency0",   type: "address", internalType: "Currency" },
          { name: "currency1",   type: "address", internalType: "Currency" },
          { name: "fee",         type: "uint24",  internalType: "uint24"   },
          { name: "tickSpacing", type: "int24",   internalType: "int24"    },
          { name: "hooks",       type: "address", internalType: "contract IHooks" },
        ],
      },
    ],
    anonymous: false,
  },
  // CREATION_FEE view function (optional — utile pour afficher le coût)
  {
    type: "function",
    name: "CREATION_FEE",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
] as const;

/**
 * ABI pour BondingCurveHook (singleton V4)
 * CurveState struct correspond à `getCurveState()` on-chain.
 */
export const BONDING_CURVE_HOOK_ABI = [
  // ── Lecture d'état ─────────────────────────────────────────────────────────
  {
    type: "function",
    name: "getCurveState",
    inputs: [{ name: "poolId", type: "bytes32", internalType: "PoolId" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct BondingCurveHook.CurveState",
        components: [
          { name: "memeToken",           type: "address", internalType: "address" },
          { name: "usdc",                type: "address", internalType: "address" },
          { name: "creator",             type: "address", internalType: "address" },
          { name: "treasury",            type: "address", internalType: "address" },
          { name: "feeDistributor",      type: "address", internalType: "address" },
          { name: "reserveUsdc",         type: "uint256", internalType: "uint256" },
          { name: "reserveTokens",       type: "uint256", internalType: "uint256" },
          { name: "realUsdcRaised",      type: "uint256", internalType: "uint256" },
          { name: "creatorFeesAccrued",  type: "uint256", internalType: "uint256" },
          { name: "creatorKeepBps",      type: "uint256", internalType: "uint256" },
          { name: "graduated",           type: "bool",    internalType: "bool"    },
          { name: "initialized",         type: "bool",    internalType: "bool"    },
          { name: "lpAdded",             type: "bool",    internalType: "bool"    },
        ],
      },
    ],
    stateMutability: "view",
  },
  // ── Fees créateur ──────────────────────────────────────────────────────────
  {
    type: "function",
    name: "claimFees",
    inputs: [
      {
        name: "key",
        type: "tuple",
        internalType: "struct PoolKey",
        components: [
          { name: "currency0",   type: "address", internalType: "Currency" },
          { name: "currency1",   type: "address", internalType: "Currency" },
          { name: "fee",         type: "uint24",  internalType: "uint24"   },
          { name: "tickSpacing", type: "int24",   internalType: "int24"    },
          { name: "hooks",       type: "address", internalType: "contract IHooks" },
        ],
      },
      { name: "to", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // ── Graduation LP ─────────────────────────────────────────────────────────
  {
    type: "function",
    name: "addGraduationLiquidity",
    inputs: [
      {
        name: "key",
        type: "tuple",
        internalType: "struct PoolKey",
        components: [
          { name: "currency0",   type: "address", internalType: "Currency" },
          { name: "currency1",   type: "address", internalType: "Currency" },
          { name: "fee",         type: "uint24",  internalType: "uint24"   },
          { name: "tickSpacing", type: "int24",   internalType: "int24"    },
          { name: "hooks",       type: "address", internalType: "contract IHooks" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // ── Events ────────────────────────────────────────────────────────────────
  {
    type: "event",
    name: "Trade",
    inputs: [
      { name: "poolId",      type: "bytes32", indexed: true,  internalType: "PoolId"  },
      { name: "trader",      type: "address", indexed: true,  internalType: "address" },
      { name: "isBuy",       type: "bool",    indexed: false, internalType: "bool"    },
      { name: "usdcAmount",  type: "uint256", indexed: false, internalType: "uint256" },
      { name: "tokenAmount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "fee",         type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Graduated",
    inputs: [
      { name: "poolId",      type: "bytes32", indexed: true,  internalType: "PoolId"  },
      { name: "usdcAdded",   type: "uint256", indexed: false, internalType: "uint256" },
      { name: "tokensAdded", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "FeesClaimed",
    inputs: [
      { name: "poolId", type: "bytes32", indexed: true,  internalType: "PoolId"  },
      { name: "to",     type: "address", indexed: false, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
] as const;

/**
 * ABI pour BondingCurveRouter
 * Permet aux EOA d'initier des swaps V4 (flash accounting via unlock/unlockCallback).
 */
export const BONDING_CURVE_ROUTER_ABI = [
  {
    type: "function",
    name: "swap",
    inputs: [
      {
        name: "key",
        type: "tuple",
        internalType: "struct PoolKey",
        components: [
          { name: "currency0",   type: "address", internalType: "Currency" },
          { name: "currency1",   type: "address", internalType: "Currency" },
          { name: "fee",         type: "uint24",  internalType: "uint24"   },
          { name: "tickSpacing", type: "int24",   internalType: "int24"    },
          { name: "hooks",       type: "address", internalType: "contract IHooks" },
        ],
      },
      { name: "zeroForOne",       type: "bool",    internalType: "bool"    },
      { name: "amountSpecified",  type: "int256",  internalType: "int256"  },
      { name: "recipient",        type: "address", internalType: "address" },
      { name: "minAmountOut",     type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "int128", internalType: "int128" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "poolManager",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "contract IPoolManager" }],
    stateMutability: "view",
  },
] as const;

/**
 * Topic du Trade event V4 (BondingCurveHook)
 * keccak256("Trade(bytes32,address,bool,uint256,uint256,uint256)")
 * Utilisé dans arc-trades/route.ts pour filtrer les logs du hook singleton.
 */
export const TRADE_EVENT_TOPIC_V4 =
  "0xb18113e1c56cce2487087581e76c857611d18d6130ba717df76423af454bdf4c" as const;
// keccak256("Trade(bytes32,address,bool,uint256,uint256,uint256)") — vérifié via viem

// ── FeeDistributor ABI ─────────────────────────────────────────────────────────
// Synthetix-style staking rewards — holders stake meme tokens to earn USDC fees.
// Deployed per-token by LaunchpadFactoryV4 when creatorKeepBps < 10000.
// Address is stored in CurveState.feeDistributor (returned by getCurveState).
export const FEE_DISTRIBUTOR_ABI = [
  {
    type: "function", name: "stake",
    inputs:  [{ name: "amount", type: "uint256" }],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "unstake",
    inputs:  [{ name: "amount", type: "uint256" }],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "claim",
    inputs:  [], outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "exit",
    inputs:  [], outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "staked",
    inputs:  [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }], stateMutability: "view",
  },
  {
    type: "function", name: "claimable",
    inputs:  [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }], stateMutability: "view",
  },
  {
    type: "function", name: "totalStaked",
    inputs:  [],
    outputs: [{ type: "uint256" }], stateMutability: "view",
  },
] as const;

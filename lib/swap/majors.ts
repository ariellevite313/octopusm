/**
 * Tokens majeurs (Bitcoin, Ether, Solana, BNB, HYPE et stablecoins) : frais OM réduits à 0,03 % au lieu de 0,3 %.
 * Liste volontairement explicite : un token absent de la liste paie le tarif normal (jamais l'inverse).
 * Pour en ajouter un : l'adresse sur sa chaîne (minuscules pour l'EVM).
 */
export const MAJOR_FEE_BPS = 3;

/** Solana : mints des majeurs (SOL, USDC, USDT, BTC et ETH enveloppés). */
export const SOLANA_MAJORS = new Set<string>([
  "So11111111111111111111111111111111111111112", // SOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", // WBTC (Wormhole)
  "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij", // cbBTC
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", // ETH (Wormhole)
]);

/** EVM : adresses des majeurs par réseau, en minuscules. Le jeton natif (ETH, BNB, HYPE) est l'autre côté de chaque paire. */
export const EVM_MAJORS: Record<"base" | "bnb" | "hyperliquid", Set<string>> = {
  base: new Set([
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", // cbBTC
    "0x4200000000000000000000000000000000000006", // WETH
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
  ]),
  bnb: new Set([
    "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", // BTCB
    "0x2170ed0880ac9a755fd29b2688956bd959f933f8", // ETH
    "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", // WBNB
    "0x570a5d26f7765ecb712c0924e4de545b89fd43df", // SOL
    "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC
    "0x55d398326f99059ff775485246999027b3197955", // USDT
  ]),
  hyperliquid: new Set([
    "0x5555555555555555555555555555555555555555", // WHYPE
    "0x9fdbda0a5e284c32744d2f17ee5c74b284993463", // UBTC
    "0xbe6727b535545c67d5caa73dea54865b92cf7907", // UETH
    "0x068f321fa8fb9f0d135f290ef6a3e2813e1c8a29", // USOL
    "0xb88339cb7199b77e23db6e890353e22632ba630f", // USDC
  ]),
};

export const isMajorSolana = (mint: string) => SOLANA_MAJORS.has(mint);
export const isMajorEvm = (chain: string, token: string) => !!(EVM_MAJORS as Record<string, Set<string>>)[chain]?.has(token.toLowerCase());

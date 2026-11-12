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
export const EVM_MAJORS: Record<string, Set<string>> = {
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
  ethereum: new Set([
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", // cbBTC
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
    "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
  ]),
  arbitrum: new Set([
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", // WBTC
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // USDC
    "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", // USDC.e
    "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT
  ]),
  polygon: new Set([
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
    "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", // WBTC
    "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", // WPOL
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // USDC
    "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT
  ]),
  avalanche: new Set([
    "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7", // WAVAX
    "0x152b9d0fdc40c096757f570a51e494bd4b943e50", // BTC.b
    "0x50b7545627a5162f82a992c33b87adc75187b218", // WBTC.e
    "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab", // WETH.e
    "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // USDC
    "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", // USDT
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
export const isMajorEvm = (chain: string, token: string) => !!EVM_MAJORS[chain]?.has(token.toLowerCase());

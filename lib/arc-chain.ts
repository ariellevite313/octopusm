import { arc as arcMainnetBuiltin } from "viem/chains";

// ── Arc Mainnet ───────────────────────────────────────────────────────────────
// Chain ID  : 5042  (hex 0x13b2)
// RPC       : https://rpc.mainnet.arc.io
// Explorer  : https://explorer.arc.io
// Gas       : USDC (18 decimals EVM, display in 6 decimals)
// viem      : import { arc } from "viem/chains"  (built-in)
export const arcMainnet = arcMainnetBuiltin;

// Alias court utilisé partout dans l'app
export const arc = arcMainnet;

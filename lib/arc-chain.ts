import { defineChain } from "viem";
import { arc as arcMainnetBuiltin } from "viem/chains";

// ── Arc Mainnet ───────────────────────────────────────────────────────────────
// Chain ID  : 5042
// RPC       : https://rpc.mainnet.arc.io
// Explorer  : https://explorer.arc.io
// viem      : import { arc } from "viem/chains"  (built-in)
export const arcMainnet = arcMainnetBuiltin;

// Alias court utilisé partout dans l'app
export const arc = arcMainnet;

// ── Arc Testnet (conservé pour référence) ─────────────────────────────────────
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.io"] },
    public:  { http: ["https://rpc.testnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.io" },
  },
  testnet: true,
});

/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />

declare global {
  interface Window {
    solana?: import("@/components/octopus-market/solana-wallet").SolanaProvider;
    phantom?: {
      solana?: import("@/components/octopus-market/solana-wallet").SolanaProvider;
    };
  }
}

export {};

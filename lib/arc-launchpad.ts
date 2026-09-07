// Adresses sur Arc Testnet
export const ARC_LAUNCHPAD_ADDRESS = "0xC41000636c9952ebBBa5b3e08F8aE885748862b1" as const;
export const ARC_USDC_ADDRESS      = "0x3600000000000000000000000000000000000000" as const;

// Supply standard : 1 milliard de tokens (18 décimales)
export const ARC_DEFAULT_SUPPLY = BigInt("1000000000000000000000000000"); // 1e27

// basePrice : 1 (= 0.000001 USDC par token)
export const ARC_DEFAULT_BASE_PRICE = BigInt(1);

// ABI minimal — fonctions utilisées côté frontend
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

export const ERC20_APPROVE_ABI = [
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
] as const;

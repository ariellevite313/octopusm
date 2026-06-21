export type SolanaPublicKey = {
  toString(): string;
};

export type SolanaSignatureResponse = {
  signature: Uint8Array;
};

export type SolanaProvider = {
  isConnected?: boolean;
  isPhantom?: boolean;
  publicKey?: SolanaPublicKey;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: SolanaPublicKey }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array, display?: "hex" | "utf8") => Promise<SolanaSignatureResponse>;
  signTransaction?: <T = unknown>(transaction: T) => Promise<T>;
  signAndSendTransaction?: <T = unknown>(
    transaction: T,
    options?: { skipPreflight?: boolean; preflightCommitment?: "processed" | "confirmed" | "finalized"; maxRetries?: number }
  ) => Promise<{ signature: string }>;
  on?: (event: "accountChanged" | "connect" | "disconnect", handler: (publicKey?: SolanaPublicKey | null) => void) => void;
  removeListener?: (
    event: "accountChanged" | "connect" | "disconnect",
    handler: (publicKey?: SolanaPublicKey | null) => void
  ) => void;
};

export type SolanaWalletBalanceSnapshot = {
  address: string;
  lamports: number;
  balanceSol: number;
  usdcBalance: number;
  usdcRawAmount: string;
  usdcDecimals: number;
  slot: number | null;
  rpcUrl: string;
  fetchedAt: number;
};

export const SOLANA_MAINNET_RPC_URLS = [
  // Primary — no API key required, browser CORS allowed
  "https://solana-rpc.publicnode.com",
  // Add your own RPC here if you have a Helius/QuickNode/Alchemy key, e.g.:
  // "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
];

export const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const SOLANA_RPC_TIMEOUT_MS = 5000;
const walletSnapshotCacheStorageKey = "octopus-market-wallet-snapshot-cache-v1";
const walletSnapshotFreshnessMs = 20_000;

type WindowWithSolana = Window & {
  solana?: SolanaProvider;
  phantom?: {
    solana?: SolanaProvider;
  };
};

let solanaWeb3ModulePromise: Promise<typeof import("@solana/web3.js")> | null = null;

function loadSolanaWeb3() {
  if (!solanaWeb3ModulePromise) {
    solanaWeb3ModulePromise = import("@solana/web3.js");
  }

  return solanaWeb3ModulePromise;
}

type RpcResult<T> = {
  result?: T;
  error?: {
    message?: string;
  };
};

type GetBalanceResult = {
  context?: {
    slot?: number;
  };
  value?: number;
};

type ParsedTokenAccountInfo = {
  parsed?: {
    info?: {
      tokenAmount?: {
        amount?: string;
        decimals?: number;
        uiAmount?: number | null;
        uiAmountString?: string;
      };
    };
  };
};

type GetParsedTokenAccountsByOwnerResult = {
  context?: {
    slot?: number;
  };
  value?: Array<{
    account?: {
      data?: ParsedTokenAccountInfo;
    };
  }>;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);

    promise
      .then((value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        globalThis.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

const WALLET_CONNECT_TIMEOUT_MS = 9000;

async function connectProviderWithTimeout(
  provider: SolanaProvider,
  options?: { onlyIfTrusted?: boolean }
) {
  return withTimeout(
    provider.connect(options),
    WALLET_CONNECT_TIMEOUT_MS,
    options?.onlyIfTrusted ? "wallet-restore-timeout" : "wallet-connect-timeout"
  );
}

function buildRpcErrorLabel(rpcUrl: string) {
  try {
    return new URL(rpcUrl).host.replace(/^www\./, "");
  } catch {
    return rpcUrl;
  }
}

async function requestSolanaRpc<T>(rpcUrl: string, method: string, params: unknown[]) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${method}-${Date.now()}`,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`${buildRpcErrorLabel(rpcUrl)} returned ${response.status}`);
  }

  const payload = (await response.json()) as RpcResult<T>;

  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }

  if (typeof payload.result === "undefined") {
    throw new Error(`${method} did not return data`);
  }

  return payload.result;
}

function normalizeUiTokenAmount(tokenAmount: {
  amount?: string;
  decimals?: number;
  uiAmount?: number | null;
  uiAmountString?: string;
}) {
  if (typeof tokenAmount.uiAmountString === "string") {
    const parsedAmount = Number(tokenAmount.uiAmountString);

    if (Number.isFinite(parsedAmount)) {
      return parsedAmount;
    }
  }

  if (typeof tokenAmount.uiAmount === "number" && Number.isFinite(tokenAmount.uiAmount)) {
    return tokenAmount.uiAmount;
  }

  const rawAmount = Number(tokenAmount.amount ?? 0);
  const decimals = typeof tokenAmount.decimals === "number" ? tokenAmount.decimals : 6;

  if (!Number.isFinite(rawAmount)) {
    return 0;
  }

  return rawAmount / 10 ** decimals;
}

export function getSolanaProvider() {
  if (typeof window === "undefined") {
    return null;
  }

  const browserWindow = window as WindowWithSolana;
  const phantomProvider = browserWindow.phantom?.solana;

  if (phantomProvider?.isPhantom) {
    return phantomProvider;
  }

  if (browserWindow.solana?.isPhantom) {
    return browserWindow.solana;
  }

  return phantomProvider ?? browserWindow.solana ?? null;
}

export async function disconnectSolanaWallet() {
  const provider = getSolanaProvider();

  if (!provider?.disconnect) {
    return;
  }

  try {
    await withTimeout(provider.disconnect(), 4000, "wallet-disconnect-timeout");
  } catch {
    return;
  }
}

export async function connectSolanaWallet() {
  const provider = getSolanaProvider();

  if (!provider) {
    throw new Error("wallet-unavailable");
  }

  const existingAddress = provider.publicKey?.toString();

  if (existingAddress) {
    return { address: existingAddress, provider };
  }

  const response = await connectProviderWithTimeout(provider);
  const address = response.publicKey?.toString() ?? provider.publicKey?.toString();

  if (!address) {
    if (provider.isConnected && provider.publicKey?.toString()) {
      return { address: provider.publicKey.toString(), provider };
    }

    throw new Error("wallet-address-missing");
  }

  return { address, provider };
}

export async function restoreSolanaWalletConnection() {
  const provider = getSolanaProvider();

  if (!provider) {
    return null;
  }

  const existingAddress = provider.publicKey?.toString();

  if (existingAddress) {
    return { address: existingAddress, provider };
  }

  try {
    const response = await connectProviderWithTimeout(provider, { onlyIfTrusted: true });
    const address = response.publicKey?.toString() ?? provider.publicKey?.toString();

    if (!address) {
      if (provider.isConnected && provider.publicKey?.toString()) {
        return { address: provider.publicKey.toString(), provider };
      }

      return null;
    }

    return { address, provider };
  } catch {
    if (provider.isConnected && provider.publicKey?.toString()) {
      return { address: provider.publicKey.toString(), provider };
    }

    return null;
  }
}

export function formatWalletAddress(address?: string | null) {
  if (!address) {
    return "No wallet connected";
  }

  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function parseUsdAmount(price: string) {
  const numericValue = Number(price.replace(/[^0-9.]/g, ""));

  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function buildPaymentReference(signature: Uint8Array) {
  const segments = Array.from(signature)
    .slice(0, 6)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return `OM-${segments}`;
}

async function fetchSnapshotFromRpc(rpcUrl: string, address: string): Promise<SolanaWalletBalanceSnapshot> {
  const { Connection, PublicKey } = await loadSolanaWeb3();
  const ownerPublicKey = new PublicKey(address);
  const usdcMintPublicKey = new PublicKey(SOLANA_USDC_MINT);
  const connection = new Connection(rpcUrl, "confirmed");

  const [lamports, tokenAccountsResponse, slot] = await Promise.all([
    withTimeout(connection.getBalance(ownerPublicKey, "confirmed"), SOLANA_RPC_TIMEOUT_MS, `balance-timeout-${rpcUrl}`),
    withTimeout(
      connection.getParsedTokenAccountsByOwner(ownerPublicKey, { mint: usdcMintPublicKey }, "confirmed"),
      SOLANA_RPC_TIMEOUT_MS,
      `usdc-timeout-${rpcUrl}`
    ),
    withTimeout(connection.getSlot("confirmed"), SOLANA_RPC_TIMEOUT_MS, `slot-timeout-${rpcUrl}`),
  ]);

  const parsedTokenAccounts = Array.isArray(tokenAccountsResponse.value) ? tokenAccountsResponse.value : [];

  let usdcBalance = 0;
  let usdcRawAmount = 0;
  let usdcDecimals = 6;

  for (const tokenAccount of parsedTokenAccounts) {
    const tokenAmount = tokenAccount.account?.data?.parsed?.info?.tokenAmount;

    if (!tokenAmount) {
      continue;
    }

    const normalizedBalance = normalizeUiTokenAmount(tokenAmount);
    const normalizedRawAmount = Number(tokenAmount.amount ?? 0);

    usdcBalance += normalizedBalance;

    if (Number.isFinite(normalizedRawAmount)) {
      usdcRawAmount += normalizedRawAmount;
    }

    if (typeof tokenAmount.decimals === "number") {
      usdcDecimals = tokenAmount.decimals;
    }
  }

  return {
    address,
    lamports,
    balanceSol: lamports / 1_000_000_000,
    usdcBalance: Number(usdcBalance.toFixed(usdcDecimals > 4 ? 4 : usdcDecimals)),
    usdcRawAmount: String(Math.max(0, Math.round(usdcRawAmount))),
    usdcDecimals,
    slot: Number.isFinite(slot) ? slot : tokenAccountsResponse.context?.slot ?? null,
    rpcUrl,
    fetchedAt: Date.now(),
  };
}

function readWalletSnapshotCache() {
  if (typeof window === "undefined") {
    return {} as Record<string, SolanaWalletBalanceSnapshot>;
  }

  try {
    const rawValue = window.localStorage.getItem(walletSnapshotCacheStorageKey);

    if (!rawValue) {
      return {} as Record<string, SolanaWalletBalanceSnapshot>;
    }

    const parsedValue = JSON.parse(rawValue) as Record<string, SolanaWalletBalanceSnapshot>;
    return parsedValue && typeof parsedValue === "object" ? parsedValue : {};
  } catch {
    return {} as Record<string, SolanaWalletBalanceSnapshot>;
  }
}

function writeWalletSnapshotCache(snapshot: SolanaWalletBalanceSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const nextCache = {
      ...readWalletSnapshotCache(),
      [snapshot.address]: snapshot,
    };

    window.localStorage.setItem(walletSnapshotCacheStorageKey, JSON.stringify(nextCache));
  } catch {
    return;
  }
}

export function readCachedWalletSnapshot(address: string) {
  if (!address) {
    return null;
  }

  return readWalletSnapshotCache()[address] ?? null;
}

export function hasFreshCachedWalletSnapshot(address: string) {
  const snapshot = readCachedWalletSnapshot(address);

  if (!snapshot?.fetchedAt) {
    return false;
  }

  return Date.now() - snapshot.fetchedAt < walletSnapshotFreshnessMs;
}

export async function fetchSolanaWalletBalanceSnapshot(address: string): Promise<SolanaWalletBalanceSnapshot> {
  const endpointErrors: string[] = [];

  return new Promise<SolanaWalletBalanceSnapshot>((resolve, reject) => {
    let settled = false;
    let pendingCount = SOLANA_MAINNET_RPC_URLS.length;

    for (const rpcUrl of SOLANA_MAINNET_RPC_URLS) {
      void fetchSnapshotFromRpc(rpcUrl, address)
        .then((snapshot) => {
          if (settled) {
            return;
          }

          settled = true;
          writeWalletSnapshotCache(snapshot);
          resolve(snapshot);
        })
        .catch((error) => {
          endpointErrors.push(error instanceof Error ? error.message : `${buildRpcErrorLabel(rpcUrl)} failed`);
          pendingCount -= 1;

          if (!settled && pendingCount === 0) {
            reject(
              new Error(
                endpointErrors.length > 0
                  ? `Live SOL and USDC balances are still syncing. ${endpointErrors.join(" · ")}`
                  : "Live SOL and USDC balances are still syncing."
              )
            );
          }
        });
    }
  });
}

export async function fetchSolanaWalletBalance(address: string) {
  const snapshot = await fetchSolanaWalletBalanceSnapshot(address);
  return snapshot.balanceSol;
}

export function formatSolBalance(balance?: number | null) {
  if (typeof balance !== "number" || Number.isNaN(balance)) {
    return "Syncing...";
  }

  if (balance >= 1000) {
    return `${balance.toLocaleString("en-US", {
      maximumFractionDigits: 2,
    })} SOL`;
  }

  if (balance >= 1) {
    return `${balance.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })} SOL`;
  }

  return `${balance.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  })} SOL`;
}

export function formatUsdcBalance(balance?: number | null) {
  if (typeof balance !== "number" || Number.isNaN(balance)) {
    return "Syncing...";
  }

  return `${balance.toLocaleString("en-US", {
    minimumFractionDigits: balance >= 1 ? 2 : 4,
    maximumFractionDigits: 4,
  })} USDC`;
}

export function calculatePercentageAmount(amount: number, rate: number) {
  return Number(((amount * rate) / 100).toFixed(2));
}

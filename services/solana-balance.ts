/**
 * On-chain Solana balance fetcher.
 * Races multiple public RPC endpoints — resolves on first success.
 */

export type OnChainBalances = {
  sol: number;
  usdc: number;
  clt: number;
  fetchedAt: number;
};

const RPC_URLS = [
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana",
  "https://solana.drpc.org",
];

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const CLT_MINT  = "DjdyfQGdtiejPhaSgraS1qaiWVhgrEFTSnd9bVnYBAGS";
const RPC_TIMEOUT_MS = 5_000;
const CACHE_KEY = "octo-market-balances-v1";
const FRESHNESS_MS = 20_000;

// ─── Cache ────────────────────────────────────────────────────────────────────

function readCache(address: string): OnChainBalances | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, OnChainBalances> : {};
    return parsed[address] ?? null;
  } catch { return null; }
}

function writeCache(address: string, data: OnChainBalances) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, OnChainBalances> : {};
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...parsed, [address]: data }));
  } catch { /* ignore */ }
}

// ─── RPC helpers ──────────────────────────────────────────────────────────────

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

async function fetchFromRpc(rpcUrl: string, address: string): Promise<OnChainBalances> {
  const { Connection, PublicKey } = await import("@solana/web3.js");
  const owner = new PublicKey(address);
  const conn = new Connection(rpcUrl, "confirmed");

  const [lamports, usdcRes, cltRes] = await Promise.all([
    withTimeout(conn.getBalance(owner, "confirmed"), RPC_TIMEOUT_MS),
    withTimeout(
      conn.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(USDC_MINT) }, "confirmed"),
      RPC_TIMEOUT_MS
    ),
    withTimeout(
      conn.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(CLT_MINT) }, "confirmed"),
      RPC_TIMEOUT_MS
    ),
  ]);

  function parseAmount(res: Awaited<ReturnType<typeof conn.getParsedTokenAccountsByOwner>>) {
    const accounts = Array.isArray(res.value) ? res.value : [];
    if (!accounts.length) return 0;
    const info = accounts[0]?.account?.data?.parsed?.info?.tokenAmount;
    return info ? Number(info.uiAmount ?? 0) : 0;
  }

  return {
    sol: lamports / 1_000_000_000,
    usdc: parseAmount(usdcRes),
    clt: parseAmount(cltRes),
    fetchedAt: Date.now(),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchOnChainBalances(address: string): Promise<OnChainBalances> {
  // Return fresh cache immediately
  const cached = readCache(address);
  if (cached && Date.now() - cached.fetchedAt < FRESHNESS_MS) return cached;

  return new Promise<OnChainBalances>((resolve, reject) => {
    let settled = false;
    let pending = RPC_URLS.length;

    for (const rpc of RPC_URLS) {
      fetchFromRpc(rpc, address).then((data) => {
        if (settled) return;
        settled = true;
        writeCache(address, data);
        resolve(data);
      }).catch(() => {
        pending -= 1;
        if (!settled && pending === 0) {
          // All failed — return stale cache or zeros
          const stale = readCache(address);
          if (stale) resolve(stale);
          else reject(new Error("All RPC endpoints failed"));
        }
      });
    }
  });
}

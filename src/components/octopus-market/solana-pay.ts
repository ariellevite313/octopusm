import { Buffer } from "buffer";
import { getSolanaProvider, SOLANA_MAINNET_RPC_URLS, SOLANA_USDC_MINT } from "@/components/octopus-market/solana-wallet";

export type PaymentRequestKind = "listing" | "launch" | "prediction";
export type PaymentRequestStatus = "created" | "signed" | "validated";
export type PaymentCurrency = "SOL" | "USDC" | "ClawdTrust";
export type PaymentRequestMetadata = Record<string, string | number | boolean>;

export type EncodedTransferRequest = {
  recipient: string;
  amount: number;
  reference: string;
  currency: PaymentCurrency;
  tokenMint?: string;
  tokenDecimals?: number;
  label?: string;
  message?: string;
  memo?: string;
};

export type PaymentRequest = EncodedTransferRequest & {
  id: string;
  kind: PaymentRequestKind;
  walletAddress: string;
  metadata?: PaymentRequestMetadata;
  encodedUrl: string;
  qrCodeSrc: string;
  signature: string | null;
  status: PaymentRequestStatus;
  createdAt: number;
  rpcUrl?: string;
  validatedAt?: number;
};

export type BuildTransactionInput = {
  kind: PaymentRequestKind;
  recipient: string;
  amount: number;
  walletAddress: string;
  currency?: PaymentCurrency;
  tokenMint?: string;
  tokenDecimals?: number;
  label?: string;
  message?: string;
  memo?: string;
  reference?: string;
  metadata?: PaymentRequestMetadata;
};

export type TransferValidationCriteria = {
  recipient: string;
  amount: number;
  reference: string;
  currency?: PaymentCurrency;
  tokenMint?: string;
  tokenDecimals?: number;
};

const paymentStorageKey = "octopus-market-payment-requests-v1";
const defaultUsdPerSolFallback = 160;
const solanaRpcTimeoutMs = 10000;
const solanaLamportsPerSol = 1_000_000_000;
const solTokenAddress = "So11111111111111111111111111111111111111112";
const memoProgramId = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const tokenProgramId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const associatedTokenProgramId = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const base58Map = new Map(base58Alphabet.split("").map((character, index) => [character, index]));

let solanaWeb3ModulePromise: Promise<typeof import("@solana/web3.js")> | null = null;

function loadSolanaWeb3() {
  if (!solanaWeb3ModulePromise) {
    solanaWeb3ModulePromise = import("@solana/web3.js");
  }

  return solanaWeb3ModulePromise;
}

function readStoredTransactions() {
  if (typeof window === "undefined") {
    return [] as PaymentRequest[];
  }

  try {
    const rawValue = window.localStorage.getItem(paymentStorageKey);

    if (!rawValue) {
      return [] as PaymentRequest[];
    }

    const parsedValue = JSON.parse(rawValue) as PaymentRequest[];
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [] as PaymentRequest[];
  }
}

export function listStoredTransactions() {
  return readStoredTransactions();
}

function writeStoredTransactions(transactions: PaymentRequest[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(paymentStorageKey, JSON.stringify(transactions));
  } catch {
    return;
  }
}

function updateStoredTransaction(transactionId: string, updater: (transaction: PaymentRequest) => PaymentRequest) {
  const transactions = readStoredTransactions();
  const nextTransactions = transactions.map((transaction) =>
    transaction.id === transactionId ? updater(transaction) : transaction
  );

  writeStoredTransactions(nextTransactions);

  return nextTransactions.find((transaction) => transaction.id === transactionId) ?? null;
}

function normalizeAmount(amount: number, decimals = 6) {
  return Number(amount.toFixed(decimals));
}

function randomHex(byteLength = 6) {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const values = new Uint8Array(byteLength);
    window.crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  return `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`.slice(0, byteLength * 2);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildOnChainMemo(paymentRequest: Pick<PaymentRequest, "id" | "kind" | "reference" | "walletAddress" | "recipient" | "amount" | "metadata" | "message">) {
  const params = new URLSearchParams();
  const metadata = paymentRequest.metadata ?? {};
  params.set("v", "1");
  params.set("kind", paymentRequest.kind);
  params.set("requestId", paymentRequest.id);
  params.set("reference", paymentRequest.reference);
  params.set("wallet", paymentRequest.walletAddress);
  params.set("recipient", paymentRequest.recipient);
  params.set("totalPaidUsdc", String(metadata.totalChargeUsdc ?? paymentRequest.amount));
  params.set("amountUsdc", String(metadata.stake ?? metadata.feeAmountUsdc ?? metadata.listingAmountUsdc ?? paymentRequest.amount));
  params.set("reserveFeeUsdc", String(metadata.reserveFee ?? 0));

  if (paymentRequest.message) {
    params.set("title", paymentRequest.message);
  }

  if (typeof metadata.marketTitle === "string") {
    params.set("marketTitle", metadata.marketTitle);
  }

  if (typeof metadata.categoryLabel === "string") {
    params.set("categoryLabel", metadata.categoryLabel);
  }

  if (typeof metadata.selectionId === "string") {
    params.set("selectionId", metadata.selectionId);
  }

  if (typeof metadata.selectionLabel === "string") {
    params.set("selectionLabel", metadata.selectionLabel);
  }

  if (typeof metadata.marketId === "string") {
    params.set("marketId", metadata.marketId);
  }

  if (typeof metadata.tokenName === "string") {
    params.set("tokenName", metadata.tokenName);
  }

  if (typeof metadata.symbol === "string") {
    params.set("symbol", metadata.symbol);
  }

  if (typeof metadata.plan === "string") {
    params.set("plan", metadata.plan);
  }

  if (typeof metadata.launchOption === "string") {
    params.set("launchOption", metadata.launchOption);
  }

  if (typeof metadata.username === "string") {
    params.set("username", metadata.username);
  }

  return `om?${params.toString()}`;
}

function parseOnChainMemo(value: string) {
  if (!value.startsWith("om?")) {
    return null;
  }

  const params = new URLSearchParams(value.slice(3));
  return {
    kind: params.get("kind") ?? "prediction",
    requestId: params.get("requestId") ?? "",
    reference: params.get("reference") ?? "",
    wallet: params.get("wallet") ?? "",
    recipient: params.get("recipient") ?? "",
    title: params.get("title") ?? "",
    marketTitle: params.get("marketTitle") ?? "",
    categoryLabel: params.get("categoryLabel") ?? "",
    marketId: params.get("marketId") ?? "",
    selectionId: params.get("selectionId") ?? "",
    selectionLabel: params.get("selectionLabel") ?? "",
    tokenName: params.get("tokenName") ?? "",
    symbol: params.get("symbol") ?? "",
    plan: params.get("plan") ?? "",
    launchOption: params.get("launchOption") ?? "",
    username: params.get("username") ?? "",
    amountUsdc: Number(params.get("amountUsdc") ?? 0),
    reserveFeeUsdc: Number(params.get("reserveFeeUsdc") ?? 0),
    totalPaidUsdc: Number(params.get("totalPaidUsdc") ?? 0),
  };
}

function createMemoInstruction(web3: Awaited<ReturnType<typeof loadSolanaWeb3>>, payer: any, memo: string) {
  const { PublicKey, TransactionInstruction } = web3;

  return new TransactionInstruction({
    programId: new PublicKey(memoProgramId),
    keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
    data: Buffer.from(memo, "utf8"),
  });
}

function hashValue(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createPseudoQrPattern(value: string) {
  const size = 21;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false));

  const paintFinder = (startX: number, startY: number) => {
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        const isOuter = x === 0 || x === 6 || y === 0 || y === 6;
        const isInner = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        matrix[startY + y][startX + x] = isOuter || isInner;
      }
    }
  };

  paintFinder(0, 0);
  paintFinder(size - 7, 0);
  paintFinder(0, size - 7);

  let seed = hashValue(value);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const insideFinder =
        (x < 7 && y < 7) ||
        (x >= size - 7 && y < 7) ||
        (x < 7 && y >= size - 7);

      if (insideFinder) {
        continue;
      }

      seed = Math.imul(seed ^ (x + 11), 2654435761) >>> 0;
      const shouldPaint = ((seed >>> ((x + y) % 17)) & 1) === 1;
      matrix[y][x] = shouldPaint;
    }
  }

  return matrix;
}

function encodeBase58(bytes: Uint8Array) {
  const digits = [0];

  for (const byte of bytes) {
    let carry = byte;

    for (let index = 0; index < digits.length; index += 1) {
      const nextValue = digits[index] * 256 + carry;
      digits[index] = nextValue % 58;
      carry = Math.floor(nextValue / 58);
    }

    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let prefix = "";

  for (const byte of bytes) {
    if (byte !== 0) {
      break;
    }

    prefix += base58Alphabet[0];
  }

  return `${prefix}${digits.reverse().map((digit) => base58Alphabet[digit]).join("")}`;
}

function decodeBase58(value: string) {
  if (!value) {
    return new Uint8Array();
  }

  const bytes = [0];

  for (const character of value) {
    const alphabetIndex = base58Map.get(character);

    if (typeof alphabetIndex !== "number") {
      throw new Error("invalid-base58");
    }

    let carry = alphabetIndex;

    for (let index = 0; index < bytes.length; index += 1) {
      const nextValue = bytes[index] * 58 + carry;
      bytes[index] = nextValue & 0xff;
      carry = nextValue >> 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (const character of value) {
    if (character !== base58Alphabet[0]) {
      break;
    }

    bytes.push(0);
  }

  return Uint8Array.from(bytes.reverse());
}

function isValidReference(value: string) {
  try {
    return decodeBase58(value).length === 32;
  } catch {
    return false;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
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
    throw new Error(`rpc-${response.status}`);
  }

  const payload = (await response.json()) as {
    result?: T;
    error?: { message?: string };
  };

  if (payload.error) {
    throw new Error(payload.error.message || `${method}-failed`);
  }

  if (typeof payload.result === "undefined") {
    throw new Error(`${method}-missing-result`);
  }

  return payload.result;
}

function extractTransferLamports(transaction: any, recipient: string) {
  const instructions = transaction?.transaction?.message?.instructions;

  if (!Array.isArray(instructions)) {
    return 0;
  }

  for (const instruction of instructions) {
    const parsedInstruction = instruction?.parsed;

    if (!parsedInstruction || parsedInstruction.type !== "transfer") {
      continue;
    }

    if (parsedInstruction.info?.destination !== recipient) {
      continue;
    }

    const lamports = parsedInstruction.info?.lamports;

    if (typeof lamports === "number") {
      return lamports;
    }

    if (typeof lamports === "string") {
      const numericLamports = Number(lamports);

      if (Number.isFinite(numericLamports)) {
        return numericLamports;
      }
    }
  }

  return 0;
}

function uiAmountToBaseUnits(amount: number, decimals: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  const normalizedAmount = amount.toFixed(decimals);
  const [wholePart, fractionalPart = ""] = normalizedAmount.split(".");
  const combined = `${wholePart}${fractionalPart.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  const numericValue = Number(combined);

  return Number.isFinite(numericValue) ? numericValue : 0;
}

function serializeU64(value: number) {
  const output = new Uint8Array(8);
  let remaining = BigInt(Math.max(0, Math.trunc(value)));

  for (let index = 0; index < 8; index += 1) {
    output[index] = Number(remaining & 255n);
    remaining >>= 8n;
  }

  return output;
}

function findAssociatedTokenAddress(web3: Awaited<ReturnType<typeof loadSolanaWeb3>>, owner: any, mint: any) {
  const { PublicKey } = web3;
  const tokenProgramPublicKey = new PublicKey(tokenProgramId);
  const associatedTokenProgramPublicKey = new PublicKey(associatedTokenProgramId);

  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgramPublicKey.toBuffer(), mint.toBuffer()],
    associatedTokenProgramPublicKey
  )[0];
}

function createAssociatedTokenAccountInstruction(web3: Awaited<ReturnType<typeof loadSolanaWeb3>>, payer: any, owner: any, mint: any, ata: any) {
  const { PublicKey, SystemProgram, TransactionInstruction } = web3;
  const associatedTokenProgramPublicKey = new PublicKey(associatedTokenProgramId);
  const tokenProgramPublicKey = new PublicKey(tokenProgramId);

  return new TransactionInstruction({
    programId: associatedTokenProgramPublicKey,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgramPublicKey, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

function createTransferCheckedInstruction(
  web3: Awaited<ReturnType<typeof loadSolanaWeb3>>,
  source: any,
  destination: any,
  mint: any,
  owner: any,
  amountBaseUnits: number,
  decimals: number,
  reference?: any
) {
  const { PublicKey, TransactionInstruction } = web3;
  const serializedAmount = serializeU64(amountBaseUnits);
  const data = Buffer.alloc(10);
  data[0] = 12;
  Buffer.from(serializedAmount).copy(data, 1);
  data[9] = decimals;
  const keys = [
    { pubkey: source, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: destination, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: true, isWritable: false },
  ];

  if (reference) {
    keys.push({ pubkey: reference, isSigner: false, isWritable: false });
  }

  return new TransactionInstruction({
    programId: new PublicKey(tokenProgramId),
    keys,
    data,
  });
}

function extractTokenTransferBaseUnits(transaction: any, destinationTokenAccount: string, mint: string) {
  const instructions = transaction?.transaction?.message?.instructions;

  if (Array.isArray(instructions)) {
    for (const instruction of instructions) {
      const parsedInstruction = instruction?.parsed;
      const info = parsedInstruction?.info;

      if (!parsedInstruction || !info) {
        continue;
      }

      if (info.destination !== destinationTokenAccount) {
        continue;
      }

      if (typeof info.mint === "string" && info.mint !== mint) {
        continue;
      }

      const tokenAmount = info.tokenAmount;

      if (tokenAmount?.amount) {
        const numericAmount = Number(tokenAmount.amount);

        if (Number.isFinite(numericAmount)) {
          return numericAmount;
        }
      }

      if (typeof info.amount === "string") {
        const numericAmount = Number(info.amount);

        if (Number.isFinite(numericAmount)) {
          return numericAmount;
        }
      }
    }
  }

  const postTokenBalances = transaction?.meta?.postTokenBalances;

  if (Array.isArray(postTokenBalances)) {
    const recipientBalance = postTokenBalances.find(
      (balance: any) => balance.owner === destinationTokenAccount || balance.mint === mint
    );

    const amount = Number(recipientBalance?.uiTokenAmount?.amount);

    if (Number.isFinite(amount)) {
      return amount;
    }
  }

  return 0;
}

function updateValidatedTransaction(transactionId: string, signature: string, rpcUrl?: string) {
  return updateStoredTransaction(transactionId, (transaction) => ({
    ...transaction,
    signature,
    rpcUrl: rpcUrl ?? transaction.rpcUrl,
    status: "validated",
    validatedAt: Date.now(),
  }));
}

function extractMemoPayload(transaction: any) {
  const instructions = transaction?.transaction?.message?.instructions;

  if (!Array.isArray(instructions)) {
    return null;
  }

  for (const instruction of instructions) {
    const programId =
      typeof instruction?.programId === "string"
        ? instruction.programId
        : typeof instruction?.programId?.toString === "function"
          ? instruction.programId.toString()
          : "";

    if (programId !== memoProgramId) {
      continue;
    }

    if (typeof instruction?.parsed === "string") {
      return instruction.parsed;
    }

    if (typeof instruction?.parsed?.memo === "string") {
      return instruction.parsed.memo;
    }

    if (typeof instruction?.data === "string") {
      try {
        return Buffer.from(decodeBase58(instruction.data)).toString("utf8");
      } catch {
        continue;
      }
    }
  }

  return null;
}

function extractSignerWalletAddress(transaction: any) {
  const accountKeys = transaction?.transaction?.message?.accountKeys;

  if (!Array.isArray(accountKeys)) {
    return "";
  }

  const signerRecord = accountKeys.find((accountKey: any) => {
    if (typeof accountKey === "string") {
      return false;
    }

    return accountKey?.signer === true || accountKey?.signer === "true";
  });

  if (typeof signerRecord?.pubkey === "string") {
    return signerRecord.pubkey;
  }

  if (typeof signerRecord?.pubkey?.toString === "function") {
    return signerRecord.pubkey.toString();
  }

  if (typeof accountKeys[0] === "string") {
    return accountKeys[0];
  }

  if (typeof accountKeys[0]?.pubkey === "string") {
    return accountKeys[0].pubkey;
  }

  if (typeof accountKeys[0]?.pubkey?.toString === "function") {
    return accountKeys[0].pubkey.toString();
  }

  return "";
}

export type IncomingTreasuryPayment = {
  signature: string;
  reference: string;
  paymentRequestId: string;
  flow: PaymentRequestKind;
  title: string;
  subtitle?: string;
  categoryLabel?: string;
  marketId?: string;
  selectionId?: string;
  selectionLabel?: string;
  username?: string;
  userWallet: string;
  recipientWallet: string;
  amountUsdc: number;
  reserveFeeUsdc: number;
  totalPaidUsdc: number;
  createdAt: number;
};

export async function scanIncomingTreasuryPayments(recipientWallet: string, options?: { limit?: number }) {
  const limit = Math.max(10, Math.min(options?.limit ?? 40, 100));
  const rpcErrors: string[] = [];
  const web3 = await loadSolanaWeb3();
  const { PublicKey } = web3;
  const recipientPublicKey = new PublicKey(recipientWallet);
  const mintPublicKey = new PublicKey(SOLANA_USDC_MINT);
  const recipientTokenAccount = findAssociatedTokenAddress(web3, recipientPublicKey, mintPublicKey).toString();

  for (const rpcUrl of SOLANA_MAINNET_RPC_URLS) {
    try {
      const signatures = await withTimeout(
        requestSolanaRpc<Array<{ signature?: string; blockTime?: number | null }>>(rpcUrl, "getSignaturesForAddress", [recipientTokenAccount, { limit }]),
        solanaRpcTimeoutMs,
        `scan-timeout-${rpcUrl}`
      );
      const discoveredPayments: IncomingTreasuryPayment[] = [];

      for (const signatureRecord of signatures) {
        const signature = signatureRecord.signature;

        if (!signature) {
          continue;
        }

        const transaction = await withTimeout(
          requestSolanaRpc<any>(rpcUrl, "getTransaction", [signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }]),
          solanaRpcTimeoutMs,
          `scan-transaction-timeout-${rpcUrl}`
        ).catch(() => null);

        if (!transaction) {
          continue;
        }

        const transferredBaseUnits = extractTokenTransferBaseUnits(transaction, recipientTokenAccount, SOLANA_USDC_MINT);

        if (transferredBaseUnits <= 0) {
          continue;
        }

        const memoPayload = extractMemoPayload(transaction);
        const memo = memoPayload ? parseOnChainMemo(memoPayload) : null;
        const totalPaidUsdc = Number((transferredBaseUnits / 10 ** 6).toFixed(2));
        const amountUsdc = Number.isFinite(memo?.amountUsdc) && (memo?.amountUsdc ?? 0) > 0 ? Number(memo!.amountUsdc.toFixed(2)) : totalPaidUsdc;
        const reserveFeeUsdc = Number.isFinite(memo?.reserveFeeUsdc) ? Number(memo!.reserveFeeUsdc.toFixed(2)) : Math.max(0, Number((totalPaidUsdc - amountUsdc).toFixed(2)));
        const flow = memo?.kind === "launch" || memo?.kind === "listing" || memo?.kind === "prediction" ? memo.kind : "prediction";
        const title = memo?.marketTitle || memo?.tokenName || memo?.plan || memo?.title || `${flow} payment`;

        discoveredPayments.push({
          signature,
          reference: memo?.reference || signature,
          paymentRequestId: memo?.requestId || signature,
          flow,
          title,
          subtitle: [memo?.selectionLabel, memo?.categoryLabel, memo?.launchOption, memo?.symbol].filter(Boolean).join(" · ") || undefined,
          categoryLabel: memo?.categoryLabel || undefined,
          marketId: memo?.marketId || undefined,
          selectionId: memo?.selectionId || undefined,
          selectionLabel: memo?.selectionLabel || undefined,
          username: memo?.username || undefined,
          userWallet: memo?.wallet || extractSignerWalletAddress(transaction),
          recipientWallet,
          amountUsdc,
          reserveFeeUsdc,
          totalPaidUsdc: Number((memo?.totalPaidUsdc && memo.totalPaidUsdc > 0 ? memo.totalPaidUsdc : totalPaidUsdc).toFixed(2)),
          createdAt: transaction.blockTime ? transaction.blockTime * 1000 : signatureRecord.blockTime ? signatureRecord.blockTime * 1000 : Date.now(),
        });
      }

      return discoveredPayments;
    } catch (error) {
      rpcErrors.push(error instanceof Error ? error.message : `scan failed on ${rpcUrl}`);
    }
  }

  throw new Error(rpcErrors.join(" · ") || "incoming-payment-scan-failed");
}

async function sendDirectWalletTransfer(paymentRequest: PaymentRequest, payerAddress: string) {
  const provider = getSolanaProvider();

  if (!provider?.signAndSendTransaction && !provider?.signTransaction) {
    throw new Error("wallet-transaction-unsupported");
  }

  const endpointErrors: string[] = [];
  const web3 = await loadSolanaWeb3();
  const { Connection, PublicKey, SystemProgram, Transaction } = web3;
  const payerPublicKey = new PublicKey(payerAddress);
  const recipientPublicKey = new PublicKey(paymentRequest.recipient);
  const referencePublicKey = new PublicKey(paymentRequest.reference);
  const isSplPayment = paymentRequest.currency === "USDC" || paymentRequest.currency === "ClawdTrust";
  const mintPublicKey = isSplPayment
    ? new PublicKey(paymentRequest.tokenMint || (paymentRequest.currency === "USDC" ? SOLANA_USDC_MINT : ""))
    : null;
  const tokenDecimals = isSplPayment ? (paymentRequest.tokenDecimals ?? 6) : 9;

  for (const rpcUrl of SOLANA_MAINNET_RPC_URLS) {
    try {
      const connection = new Connection(rpcUrl, "confirmed");
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const transaction = new Transaction({
        feePayer: payerPublicKey,
        recentBlockhash: blockhash,
      });

      if (isSplPayment && mintPublicKey) {
        const payerTokenAccount = findAssociatedTokenAddress(web3, payerPublicKey, mintPublicKey);
        const recipientTokenAccount = findAssociatedTokenAddress(web3, recipientPublicKey, mintPublicKey);
        const recipientAtaInfo = await connection.getAccountInfo(recipientTokenAccount, "confirmed");
        const memoPayload = paymentRequest.memo || buildOnChainMemo(paymentRequest);

        if (!recipientAtaInfo) {
          transaction.add(createAssociatedTokenAccountInstruction(web3, payerPublicKey, recipientPublicKey, mintPublicKey, recipientTokenAccount));
        }

        if (memoPayload) {
          transaction.add(createMemoInstruction(web3, payerPublicKey, memoPayload));
        }

        transaction.add(
          createTransferCheckedInstruction(
            web3,
            payerTokenAccount,
            recipientTokenAccount,
            mintPublicKey,
            payerPublicKey,
            uiAmountToBaseUnits(paymentRequest.amount, tokenDecimals),
            tokenDecimals,
            referencePublicKey
          )
        );
      } else {
        const lamports = Math.max(1, Math.round(paymentRequest.amount * solanaLamportsPerSol));
        const transferInstruction = SystemProgram.transfer({
          fromPubkey: payerPublicKey,
          toPubkey: recipientPublicKey,
          lamports,
        });

        transferInstruction.keys.push({
          pubkey: referencePublicKey,
          isSigner: false,
          isWritable: false,
        });

        transaction.add(transferInstruction);
      }

      const signature = provider.signAndSendTransaction
        ? (await provider.signAndSendTransaction(transaction, {
            maxRetries: 3,
            preflightCommitment: "confirmed",
          })).signature
        : await connection.sendRawTransaction((await provider.signTransaction!(transaction)).serialize(), {
            maxRetries: 3,
            preflightCommitment: "confirmed",
          });

      await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        "confirmed"
      );

      return { signature, rpcUrl };
    } catch (error) {
      endpointErrors.push(error instanceof Error ? error.message : `transfer failed on ${rpcUrl}`);
    }
  }

  throw new Error(endpointErrors.join(" · ") || "wallet-transfer-failed");
}

function openSolanaPaymentUrl(encodedUrl: string) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("window-unavailable");
  }

  const anchor = document.createElement("a");
  anchor.href = encodedUrl;
  anchor.rel = "noreferrer noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

async function pollReferenceOnChain(reference: string, timeoutMs = 45000, intervalMs = 2500) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    for (const rpcUrl of SOLANA_MAINNET_RPC_URLS) {
      try {
        const signatures = await withTimeout(
          requestSolanaRpc<Array<{ signature?: string }>>(rpcUrl, "getSignaturesForAddress", [reference, { limit: 5 }]),
          solanaRpcTimeoutMs,
          `reference-timeout-${rpcUrl}`
        );
        const signature = signatures[0]?.signature;

        if (signature) {
          return { signature, rpcUrl };
        }
      } catch {
        continue;
      }
    }

    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }

  throw new Error("reference-timeout");
}

export function createQR(value: string) {
  const matrix = createPseudoQrPattern(value);
  const cellSize = 7;
  const qrSize = matrix.length * cellSize;
  const encodedLabel = escapeXml(value.slice(0, 54));
  const cells = matrix
    .flatMap((row, y) =>
      row.map((filled, x) =>
        filled
          ? `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" rx="1" fill="#18181b" />`
          : ""
      )
    )
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${qrSize}" height="${qrSize + 44}" viewBox="0 0 ${qrSize} ${qrSize + 44}">
      <rect width="100%" height="100%" rx="20" fill="#ffffff" />
      <rect x="0" y="0" width="${qrSize}" height="${qrSize}" rx="18" fill="#ffffff" />
      ${cells}
      <text x="${qrSize / 2}" y="${qrSize + 22}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#52525b">Scan or open in Phantom</text>
      <text x="${qrSize / 2}" y="${qrSize + 34}" text-anchor="middle" font-family="Arial, sans-serif" font-size="8" fill="#71717a">${encodedLabel}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function createPaymentReference() {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return encodeBase58(bytes);
  }

  const fallbackBytes = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 17 + Date.now()) % 256));
  return encodeBase58(fallbackBytes);
}

export function encodeURL({ recipient, amount, reference, currency, tokenMint, tokenDecimals, label, message, memo }: EncodedTransferRequest) {
  const params = new URLSearchParams();
  const isSpl = currency === "USDC" || currency === "ClawdTrust";
  const decimals = isSpl ? tokenDecimals ?? 6 : 9;
  params.set("amount", normalizeAmount(amount, decimals).toFixed(decimals));
  params.append("reference", reference);

  if (isSpl && tokenMint) {
    params.set("spl-token", tokenMint);
  }

  if (label) {
    params.set("label", label);
  }

  if (message) {
    params.set("message", message);
  }

  if (memo) {
    params.set("memo", memo);
  }

  return `solana:${recipient}?${params.toString()}`;
}

export function parseURL(encodedUrl: string): EncodedTransferRequest {
  const [schemePart, queryPart = ""] = encodedUrl.split("?");
  const recipient = schemePart.replace(/^solana:/i, "");
  const params = new URLSearchParams(queryPart);
  const amount = Number(params.get("amount") ?? 0);
  const tokenMint = params.get("spl-token") ?? undefined;
  const currency: PaymentCurrency = tokenMint ? "USDC" : "SOL";

  return {
    recipient,
    amount: Number.isFinite(amount) ? amount : 0,
    reference: params.get("reference") ?? "",
    currency,
    tokenMint,
    tokenDecimals: currency === "USDC" ? 6 : 9,
    label: params.get("label") ?? undefined,
    message: params.get("message") ?? undefined,
    memo: params.get("memo") ?? undefined,
  };
}

export function createTransfer(input: BuildTransactionInput) {
  const reference = input.reference ?? createPaymentReference();
  const currency = input.currency ?? "SOL";
  const isSplTransfer = currency === "USDC" || currency === "ClawdTrust";
  const tokenMint = isSplTransfer
    ? (currency === "USDC" ? (input.tokenMint ?? SOLANA_USDC_MINT) : input.tokenMint)
    : undefined;
  const tokenDecimals = isSplTransfer ? (input.tokenDecimals ?? 6) : 9;
  const amount = normalizeAmount(input.amount, tokenDecimals);
  const encodedUrl = encodeURL({
    recipient: input.recipient,
    amount,
    reference,
    currency,
    tokenMint,
    tokenDecimals,
    label: input.label,
    message: input.message,
    memo: input.memo,
  });

  return {
    recipient: input.recipient,
    amount,
    reference,
    currency,
    tokenMint,
    tokenDecimals,
    label: input.label,
    message: input.message,
    memo: input.memo,
    encodedUrl,
  };
}

export function buildTransaction(input: BuildTransactionInput) {
  const transfer = createTransfer(input);
  const draftRequest: PaymentRequest = {
    id: `tx-${Date.now().toString(36).toUpperCase()}-${randomHex(5).toUpperCase()}`,
    kind: input.kind,
    walletAddress: input.walletAddress,
    metadata: input.metadata,
    qrCodeSrc: createQR(transfer.encodedUrl),
    signature: null,
    status: "created",
    createdAt: Date.now(),
    ...transfer,
  };
  const memo = buildOnChainMemo(draftRequest);
  const request: PaymentRequest = {
    ...draftRequest,
    memo,
    encodedUrl: encodeURL({
      recipient: draftRequest.recipient,
      amount: draftRequest.amount,
      reference: draftRequest.reference,
      currency: draftRequest.currency,
      tokenMint: draftRequest.tokenMint,
      tokenDecimals: draftRequest.tokenDecimals,
      label: draftRequest.label,
      message: draftRequest.message,
      memo,
    }),
  };
  request.qrCodeSrc = createQR(request.encodedUrl);
  const nextTransactions = [request, ...readStoredTransactions()].slice(0, 120);

  writeStoredTransactions(nextTransactions);

  return request;
}

export async function fetchTransaction(transactionId: string) {
  return readStoredTransactions().find((transaction) => transaction.id === transactionId) ?? null;
}

export async function fetchLiveSolPriceUsd() {
  try {
    const response = await fetch(`https://public-api.birdeye.so/defi/price?address=${solTokenAddress}`, {
      headers: {
        accept: "application/json",
        "x-chain": "solana",
      },
    });

    if (!response.ok) {
      throw new Error("sol-price-unavailable");
    }

    const payload = (await response.json()) as {
      data?: {
        value?: number;
        price?: number;
      };
    };

    const numericValue = Number(payload.data?.value ?? payload.data?.price);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      throw new Error("sol-price-unavailable");
    }

    return numericValue;
  } catch {
    return defaultUsdPerSolFallback;
  }
}

export function convertUsdAmountToSol(usdAmount: number, solPriceUsd: number) {
  if (!Number.isFinite(usdAmount) || usdAmount <= 0 || !Number.isFinite(solPriceUsd) || solPriceUsd <= 0) {
    return 0;
  }

  return normalizeAmount(usdAmount / solPriceUsd, 9);
}

export async function submitSolanaTransfer(paymentRequest: PaymentRequest) {
  const provider = getSolanaProvider();

  if (!provider?.publicKey) {
    throw new Error("wallet-unavailable");
  }

  const payerAddress = provider.publicKey.toString();

  if (payerAddress !== paymentRequest.walletAddress) {
    throw new Error("wallet-account-mismatch");
  }

  if (!isValidReference(paymentRequest.reference)) {
    throw new Error("invalid-payment-reference");
  }

  if (provider.signAndSendTransaction || provider.signTransaction) {
    const directTransfer = await sendDirectWalletTransfer(paymentRequest, payerAddress);
    const updatedRequest = updateStoredTransaction(paymentRequest.id, (transactionRecord) => ({
      ...transactionRecord,
      signature: directTransfer.signature,
      rpcUrl: directTransfer.rpcUrl,
      status: "signed",
    }));

    if (!updatedRequest) {
      throw new Error("payment-request-missing");
    }

    return updatedRequest;
  }

  openSolanaPaymentUrl(paymentRequest.encodedUrl);

  const foundReference = await pollReferenceOnChain(paymentRequest.reference);
  const updatedRequest = updateStoredTransaction(paymentRequest.id, (transactionRecord) => ({
    ...transactionRecord,
    signature: foundReference.signature,
    rpcUrl: foundReference.rpcUrl,
    status: "signed",
  }));

  if (!updatedRequest) {
    throw new Error("payment-request-missing");
  }

  return updatedRequest;
}

export async function findReference(reference: string) {
  const storedRequest = readStoredTransactions().find((transaction) => transaction.reference === reference) ?? null;
  const shouldUseChainLookup = storedRequest?.metadata?.onChainTransfer === true || !storedRequest;

  if (shouldUseChainLookup && isValidReference(reference)) {
    try {
      const foundReference = await pollReferenceOnChain(reference, 18000, 2000);
      return {
        signature: foundReference.signature,
        reference,
        rpcUrl: foundReference.rpcUrl,
        request: storedRequest,
      };
    } catch {
      if (!storedRequest) {
        return null;
      }
    }
  }

  if (!storedRequest) {
    return null;
  }

  return {
    signature: storedRequest.signature,
    reference,
    rpcUrl: storedRequest.rpcUrl,
    request: storedRequest,
  };
}

export async function attachSignature(transactionId: string, signature: string) {
  return updateStoredTransaction(transactionId, (transaction) => ({
    ...transaction,
    signature,
    status: "signed",
  }));
}

export async function validateTransfer(signature: string, criteria: TransferValidationCriteria) {
  const transactions = readStoredTransactions();
  const normalizedCurrency = criteria.currency ?? "SOL";
  const isSplValidation = normalizedCurrency === "USDC" || normalizedCurrency === "ClawdTrust";
  const normalizedTokenMint = isSplValidation
    ? (normalizedCurrency === "USDC" ? (criteria.tokenMint ?? SOLANA_USDC_MINT) : criteria.tokenMint)
    : undefined;
  const normalizedTokenDecimals = isSplValidation ? (criteria.tokenDecimals ?? 6) : 9;
  const matchingTransaction = transactions.find(
    (transaction) =>
      transaction.reference === criteria.reference &&
      transaction.recipient === criteria.recipient &&
      transaction.currency === normalizedCurrency &&
      Math.abs(transaction.amount - normalizeAmount(criteria.amount, normalizedTokenDecimals)) < 0.000000001
  );
  const shouldUseChainValidation = matchingTransaction?.metadata?.onChainTransfer === true || !matchingTransaction;

  if (shouldUseChainValidation && isValidReference(criteria.reference)) {
    const rpcUrls = matchingTransaction?.rpcUrl
      ? [matchingTransaction.rpcUrl, ...SOLANA_MAINNET_RPC_URLS.filter((rpcUrl) => rpcUrl !== matchingTransaction.rpcUrl)]
      : SOLANA_MAINNET_RPC_URLS;

    for (const rpcUrl of rpcUrls) {
      try {
        const transaction = await withTimeout(
          requestSolanaRpc<any>(rpcUrl, "getTransaction", [signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }]),
          solanaRpcTimeoutMs,
          `validation-timeout-${rpcUrl}`
        );

        const accountKeys = transaction?.transaction?.message?.accountKeys?.map((accountKey: any) =>
          typeof accountKey === "string"
            ? accountKey
            : typeof accountKey?.pubkey === "string"
              ? accountKey.pubkey
              : accountKey?.pubkey?.toString?.()
        );

        if (!Array.isArray(accountKeys) || !accountKeys.includes(criteria.reference)) {
          continue;
        }

        if (isSplValidation && normalizedTokenMint) {
          const web3 = await loadSolanaWeb3();
          const { PublicKey } = web3;
          const recipientTokenAccount = findAssociatedTokenAddress(
            web3,
            new PublicKey(criteria.recipient),
            new PublicKey(normalizedTokenMint)
          ).toString();
          const transferredBaseUnits = extractTokenTransferBaseUnits(transaction, recipientTokenAccount, normalizedTokenMint);
          const expectedBaseUnits = uiAmountToBaseUnits(criteria.amount, normalizedTokenDecimals);

          if (transferredBaseUnits < expectedBaseUnits) {
            continue;
          }
        } else {
          const transferredLamports = extractTransferLamports(transaction, criteria.recipient);
          const expectedLamports = Math.max(1, Math.round(criteria.amount * solanaLamportsPerSol));

          if (transferredLamports < expectedLamports) {
            continue;
          }
        }

        if (!matchingTransaction) {
          return {
            id: signature,
            kind: "prediction" as const,
            walletAddress: "",
            recipient: criteria.recipient,
            amount: criteria.amount,
            reference: criteria.reference,
            currency: normalizedCurrency,
            tokenMint: normalizedTokenMint,
            tokenDecimals: normalizedTokenDecimals,
            encodedUrl: "",
            qrCodeSrc: "",
            signature,
            status: "validated" as const,
            createdAt: Date.now(),
            validatedAt: Date.now(),
            rpcUrl,
          } satisfies PaymentRequest;
        }

        const updatedTransaction = updateValidatedTransaction(matchingTransaction.id, signature, rpcUrl);

        if (!updatedTransaction) {
          throw new Error("payment-validation-failed");
        }

        return updatedTransaction;
      } catch {
        continue;
      }
    }
  }

  if (!matchingTransaction || matchingTransaction.signature !== signature) {
    throw new Error("payment-validation-failed");
  }

  const updatedTransaction = updateValidatedTransaction(matchingTransaction.id, signature, matchingTransaction.rpcUrl);

  if (!updatedTransaction) {
    throw new Error("payment-validation-failed");
  }

  return updatedTransaction;
}

export function serializeSignature(signature: Uint8Array) {
  let binary = "";

  signature.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    return window.btoa(binary);
  }

  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

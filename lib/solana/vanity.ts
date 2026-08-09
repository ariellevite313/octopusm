/**
 * Vanity address generator — finds a Solana keypair whose base58 public key
 * ends with the given suffix (case-sensitive).
 *
 * NOTE: This is CPU-intensive. For production, run in a Worker thread or
 * a dedicated background job. The OCTO suffix (4 chars) takes ~10M iterations
 * on average (~a few seconds on a modern CPU).
 */

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

export type VanityResult = {
  publicKey: string;         // base58
  secretKey: Uint8Array;     // 64 bytes
};

/**
 * Synchronously brute-forces keypairs until the public key ends with `suffix`.
 * Returns null if `maxIterations` is reached without finding a match.
 *
 * ⚠️  WARNING: This is CPU-intensive and blocks the Node.js event loop.
 *     Use generateVanityAddressAsync for server-side use.
 *     This sync version is kept for Worker thread contexts only.
 */
export function generateVanityAddress(
  suffix: string,
  maxIterations = 20_000_000,
): VanityResult | null {
  const upper = suffix.toUpperCase();
  let i = 0;
  while (i < maxIterations) {
    const kp = Keypair.generate();
    const addr = kp.publicKey.toBase58();
    if (addr.toUpperCase().endsWith(upper)) {
      return { publicKey: kp.publicKey.toBase58(), secretKey: kp.secretKey };
    }
    i++;
  }
  return null;
}

/**
 * Async version: yields to the Node.js event loop every `chunkSize` iterations
 * via setImmediate so other requests are not blocked.
 *
 * A 4-character suffix like "OCTO" takes ~10M iterations on average.
 * With chunkSize=10_000 that adds ~1000 micro-yields, negligible overhead.
 */
export async function generateVanityAddressAsync(
  suffix: string,
  maxIterations = 20_000_000,
  chunkSize = 10_000,
): Promise<VanityResult | null> {
  const upper = suffix.toUpperCase();
  let i = 0;
  while (i < maxIterations) {
    // Process a chunk synchronously
    const end = Math.min(i + chunkSize, maxIterations);
    while (i < end) {
      const kp = Keypair.generate();
      const addr = kp.publicKey.toBase58();
      if (addr.toUpperCase().endsWith(upper)) {
        return { publicKey: kp.publicKey.toBase58(), secretKey: kp.secretKey };
      }
      i++;
    }
    // Yield to allow other requests to be served between chunks
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  return null;
}

/**
 * Encode a secret key as a base58 string for safe storage.
 * Never log or return this to the client.
 */
export function encodeSecretKey(secretKey: Uint8Array): string {
  return bs58.encode(secretKey);
}

export function decodeSecretKey(encoded: string): Uint8Array {
  return bs58.decode(encoded);
}

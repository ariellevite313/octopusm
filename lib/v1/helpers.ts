/**
 * lib/v1/helpers.ts
 * Shared utilities for the /api/v1 read-only REST API.
 */

import { NextResponse } from "next/server";

const ARC_RPC = "https://rpc.mainnet.arc.io";
const CACHE_TTL = 30; // seconds

// ── CORS ──────────────────────────────────────────────────────────────────────

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control":                `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
} as const;

export function corsOk() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export function err(msg: string, status: number) {
  return NextResponse.json({ error: msg }, { status, headers: CORS_HEADERS });
}

// ── Address validation ────────────────────────────────────────────────────────

export function isValidEvm(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

// ── Arc RPC eth_call ──────────────────────────────────────────────────────────

let _rpcId = 1;

export async function ethCall(
  to: string,
  data: string,
): Promise<string> {
  const id = _rpcId++;
  const res = await fetch(ARC_RPC, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method:  "eth_call",
      params:  [{ to, data }, "latest"],
      id,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return "0x";
  const j = await res.json() as { result?: string; error?: unknown };
  return j.result ?? "0x";
}

/**
 * Read a single uint256 from a contract (no args).
 */
export async function readUint256(contract: string, selector: string): Promise<bigint> {
  const raw = await ethCall(contract, selector);
  if (!raw || raw === "0x" || raw.length < 66) return 0n;
  return BigInt(raw.slice(0, 66));
}

/**
 * Read a uint256 from a contract with one address argument.
 */
export async function readUint256WithAddr(
  contract: string,
  selector: string,
  addr: string,
): Promise<bigint> {
  // ABI-encode: selector (4 bytes) + address padded to 32 bytes
  const paddedAddr = addr.toLowerCase().replace("0x", "").padStart(64, "0");
  const calldata   = selector + paddedAddr;
  const raw        = await ethCall(contract, calldata);
  if (!raw || raw === "0x" || raw.length < 66) return 0n;
  return BigInt(raw.slice(0, 66));
}

// Function selectors — verified via viem keccak256
// creatorAccrued()           → 0x1d35d994
// pendingDividend(address)   → 0xdeedd49c
// claimCreatorFees(address)  → 0xd6ae6e44
// claimDividend()            → 0xf0fc6bca
export const SEL_CREATOR_ACCRUED    = "0x1d35d994";
export const SEL_PENDING_DIVIDEND   = "0xdeedd49c";
export const SEL_CLAIM_CREATOR_FEES = "0xd6ae6e44";
export const SEL_CLAIM_DIVIDEND     = "0xf0fc6bca";

// ── BigInt → decimal string (18 decimals) ────────────────────────────────────

export function weiToDecStr(wei: bigint): string {
  if (wei === 0n) return "0";
  const DECIMALS = 18n;
  const D = 10n ** DECIMALS;
  const whole = wei / D;
  const frac  = wei % D;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(Number(DECIMALS), "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

// ── Rate limit (in-memory, per IP, resets each minute) ───────────────────────

const _rlMap = new Map<string, { count: number; reset: number }>();
const RL_MAX = 60; // requests per minute per IP

export function checkRateLimit(ip: string): boolean {
  const now  = Date.now();
  const key  = ip;
  const slot = _rlMap.get(key);
  if (!slot || now > slot.reset) {
    _rlMap.set(key, { count: 1, reset: now + 60_000 });
    return true;
  }
  if (slot.count >= RL_MAX) return false;
  slot.count++;
  return true;
}

export function getIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

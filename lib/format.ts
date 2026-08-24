/**
 * Shared number formatting helpers.
 * Import from "@/lib/format" in any component or service.
 */

/** Compact number: 1 234 567 → "1.2M", 12 345 → "12.3k", else fixed */
export function fmt(n: number, decimals = 2): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)    return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(decimals);
}

/** Short date: ISO → "Jan 5, 2025" */
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Abbreviated wallet address */
export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

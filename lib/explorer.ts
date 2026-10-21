/** Lien explorateur d'une transaction : Arc (hash 0x…) ou Solana (signature base58). */
export function txUrl(tx: string): string {
  return /^0x[0-9a-fA-F]{64}$/.test(tx)
    ? `https://explorer.arc.io/tx/${tx}`
    : `https://solscan.io/tx/${tx}`;
}

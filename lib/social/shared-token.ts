/** Token partagé par lien dans un texte (omdot.fun/share/token/<adresse> ou /terminal?mint=<adresse>) */
import type { TerminalChain } from "@/lib/terminal";

const LINK_RE = /omdot\.fun\/(?:share\/token\/([1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-fA-F]{40})(?:\?chain=([a-z]+))?|terminal\?(?:chain=([a-z]+)&)?mint=([1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-fA-F]{40}))/;

/** Adresse et réseau du premier token partagé par lien dans un texte, sinon null */
export function sharedTokenOf(body: string): { mint: string; chain: TerminalChain } | null {
  const m = body.match(LINK_RE);
  if (!m) return null;
  const mint = m[1] ?? m[4];
  const chain = (m[2] ?? m[3] ?? (mint.startsWith("0x") ? "arc" : "solana")) as TerminalChain;
  return mint ? { mint, chain } : null;
}


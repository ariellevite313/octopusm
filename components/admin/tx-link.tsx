import { ExternalLink } from "lucide-react";
import { txUrl } from "@/lib/explorer";

/** Lien cliquable vers l'explorateur (Solscan ou Arc) pour vérifier une transaction. */
export function TxLink({ tx, className = "" }: { tx: string | null | undefined; className?: string }) {
  if (!tx) return null;
  return (
    <a
      href={txUrl(tx)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 font-mono text-xs text-sky-600 hover:underline dark:text-sky-400 ${className}`}
      title={tx}
    >
      TX: {tx.slice(0, 6)}…{tx.slice(-4)}
      <ExternalLink className="size-3" />
    </a>
  );
}

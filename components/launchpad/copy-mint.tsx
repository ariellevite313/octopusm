"use client";

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

export function CopyMint({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("CA copié !", {
        description: `${address.slice(0, 8)}…${address.slice(-6)}`,
        duration: 2000,
      });
    });
  }, [address]);

  return (
    <button
      onClick={copy}
      className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
      title="Copier l'adresse"
    >
      {copied
        ? <Check className="size-3 text-emerald-400" />
        : <Copy className="size-3" />
      }
    </button>
  );
}
